import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import * as api from "@workspace/api-zod";
import { db, academicCatalogTable, studentsTable, schoolUsersTable, academicLessonsTable, classroomsTable } from "@workspace/db";
import { currentSchoolUser, requireRole } from "../middlewares/schoolAuth";
import { academicAction, calendarDate, catalogRef, fail } from "../lib/academic-domain";
const router: IRouter = Router();
router.get("/academic/catalog", academicAction(async (_req, res) => {
    const user = currentSchoolUser(res);
    const items = await db.select().from(academicCatalogTable);
    const [student] = user.studentId ? await db.select().from(studentsTable).where(eq(studentsTable.id, user.studentId)) : [];
    res.json(api.GetAcademicCatalogResponse.parse({
        cohorts: items.filter(i => i.kind === "cohorts" && (user.role === "admin" || i.id === student?.cohortId)),
        subjects: items.filter(i => i.kind === "subjects"),
        semesters: items.filter(i => i.kind === "semesters"),
        rooms: items.filter(i => i.kind === "rooms"),
    }));
}));
router.post("/academic/catalog/:kind", requireRole("admin"), academicAction(async (req, res) => {
    const { kind } = api.CreateAcademicCatalogItemParams.parse(req.params);
    const input = api.CreateAcademicCatalogItemBody.parse(req.body);
    if (!input.code.trim() || !input.name.trim())
        fail(400, "Mã và tên không được để trống.");
    if (kind === "semesters") {
        if (!input.startDate || !input.endDate)
            fail(400, "Học kỳ cần ngày bắt đầu và kết thúc.");
        calendarDate(input.startDate);
        calendarDate(input.endDate);
        if (input.startDate > input.endDate)
            fail(400, "Khoảng ngày học kỳ không hợp lệ.");
    }
    if (kind === "rooms" && ((input.latitude == null) !== (input.longitude == null)))
        fail(400, "Cần nhập đủ cả vĩ độ và kinh độ.");
    const [created] = await db.insert(academicCatalogTable).output().values({
        ...input, kind, code: input.code.trim().toUpperCase(), name: input.name.trim(),
        startDate: kind === "semesters" ? input.startDate : null,
        endDate: kind === "semesters" ? input.endDate : null,
    });
    res.status(201).json(api.CreateAcademicCatalogItemResponse.parse(created));
}));
router.patch("/academic/catalog/:kind/:id", requireRole("admin"), academicAction(async (req, res) => {
    const { kind, id } = api.UpdateAcademicCatalogItemParams.parse(req.params);
    const input = api.UpdateAcademicCatalogItemBody.parse(req.body);
    if (!input.code.trim() || !input.name.trim())
        fail(400, "Mã và tên không được để trống.");
    if (kind === "semesters") {
        if (!input.startDate || !input.endDate)
            fail(400, "Học kỳ cần đủ ngày bắt đầu và kết thúc.");
        calendarDate(input.startDate);
        calendarDate(input.endDate);
        if (input.startDate > input.endDate)
            fail(400, "Khoảng ngày học kỳ không hợp lệ.");
    }
    if (kind === "rooms" && ((input.latitude == null) !== (input.longitude == null)))
        fail(400, "Cần nhập đủ vĩ độ và kinh độ.");
    const saved = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        await catalogRef(tx, id, kind, true);
        const lessons = await tx.select({ lesson: academicLessonsTable, section: classroomsTable }).from(academicLessonsTable)
            .innerJoin(classroomsTable, eq(classroomsTable.id, academicLessonsTable.classId));
        const related = lessons.filter(({ lesson, section }) => lesson.status === "scheduled" &&
            (kind === "rooms" ? lesson.roomId === id : kind === "semesters" ? section.semesterId === id : kind === "subjects" ? section.subjectId === id : false));
        if (!input.active && related.some(({ lesson }) => lesson.endsAt > new Date()))
            fail(409, "Mục này còn buổi học sắp tới; hãy đổi hoặc hủy lịch trước khi ngừng sử dụng.");
        if (kind === "semesters" && related.some(({ lesson }) => {
            const day = new Date(lesson.startsAt.getTime() + 7 * 3600000).toISOString().slice(0, 10);
            return day < input.startDate! || day > input.endDate!;
        }))
            fail(409, "Khoảng ngày mới không bao gồm các buổi học đã xếp.");
        const [updated] = await tx.update(academicCatalogTable).set({
            ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(),
            startDate: kind === "semesters" ? input.startDate : null, endDate: kind === "semesters" ? input.endDate : null,
            latitude: input.latitude ?? null, longitude: input.longitude ?? null,
        }).output().where(eq(academicCatalogTable.id, id));
        // Labels are current catalog names; session GPS snapshots are never changed.
        if (kind === "subjects")
            await tx.update(classroomsTable).set({ subject: updated!.name }).where(eq(classroomsTable.subjectId, id));
        if (kind === "rooms")
            await tx.update(classroomsTable).set({ room: updated!.name, latitude: updated!.latitude,
                longitude: updated!.longitude, checkInRadiusMeters: updated!.checkInRadiusMeters }).where(eq(classroomsTable.roomId, id));
        return updated;
    });
    res.json(api.UpdateAcademicCatalogItemResponse.parse(saved));
}));
router.get("/academic/students", requireRole("admin"), academicAction(async (_req, res) => {
    const rows = await db.select({ student: studentsTable, cohortName: academicCatalogTable.name, accountId: schoolUsersTable.id })
        .from(studentsTable).leftJoin(academicCatalogTable, eq(studentsTable.cohortId, academicCatalogTable.id))
        .leftJoin(schoolUsersTable, eq(schoolUsersTable.studentId, studentsTable.id));
    res.json(api.ListAcademicStudentsResponse.parse(rows.map(r => ({ ...r.student, cohortName: r.cohortName, accountId: r.accountId }))));
}));
router.post("/academic/students", requireRole("admin"), academicAction(async (req, res) => {
    const input = api.CreateAcademicStudentBody.parse(req.body);
    if (!input.fullName.trim() || !input.studentCode.trim())
        fail(400, "Họ tên và mã sinh viên không được để trống.");
    const result = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const cohort = input.cohortId ? await catalogRef(tx, input.cohortId, "cohorts") : null;
        const [student] = await tx.insert(studentsTable).output().values({ ...input, fullName: input.fullName.trim(),
            studentCode: input.studentCode.trim().toUpperCase() });
        return { ...student, cohortName: cohort?.name ?? null, accountId: null };
    });
    res.status(201).json(api.CreateAcademicStudentResponse.parse(result));
}));
router.patch("/academic/students/:id", requireRole("admin"), academicAction(async (req, res) => {
    const { id } = api.UpdateAcademicStudentParams.parse(req.params);
    const input = api.UpdateAcademicStudentBody.parse(req.body);
    if (!input.fullName.trim() || !input.studentCode.trim())
        fail(400, "Họ tên và mã sinh viên không được để trống.");
    const result = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [old] = await tx.select().from(studentsTable).where(eq(studentsTable.id, id));
        if (!old)
            fail(404, "Không tìm thấy sinh viên.");
        const cohort = input.cohortId ? await catalogRef(tx, input.cohortId, "cohorts", old.cohortId === input.cohortId) : null;
        const [student] = await tx.update(studentsTable).set({ ...input, fullName: input.fullName.trim(),
            studentCode: input.studentCode.trim().toUpperCase() }).output().where(eq(studentsTable.id, id));
        const accounts = await tx.update(schoolUsersTable).set({ displayName: student!.fullName }).output().where(eq(schoolUsersTable.studentId, id));
        return { ...student, cohortName: cohort?.name ?? null, accountId: accounts[0]?.id ?? null };
    });
    res.json(api.UpdateAcademicStudentResponse.parse(result));
}));
export default router;
