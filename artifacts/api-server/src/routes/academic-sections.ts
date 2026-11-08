import { upsertReturning as _upsertReturning } from "@workspace/db";
import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import * as api from "@workspace/api-zod";
import { db, classroomsTable, courseEnrollmentsTable, studentsTable, schoolUsersTable, teacherClassAssignmentsTable, academicLessonsTable, attendanceSessionsTable } from "@workspace/db";
import { accessibleClassIds, currentSchoolUser, requireRole } from "../middlewares/schoolAuth";
import { academicAction, assertNoConflicts, catalogRef, fail, studentSectionIds, type AcademicTx } from "../lib/academic-domain";
const router: IRouter = Router();
async function sectionPayload(tx: AcademicTx | typeof db, id: number, ownStudentId?: number) {
    const [section] = await tx.select().from(classroomsTable).where(eq(classroomsTable.id, id));
    if (!section)
        fail(404, "Không tìm thấy lớp học phần.");
    const teachers = await tx.select().from(teacherClassAssignmentsTable).where(eq(teacherClassAssignmentsTable.classId, id));
    const members = await tx.select().from(courseEnrollmentsTable)
        .where(and(eq(courseEnrollmentsTable.classId, id), isNull(courseEnrollmentsTable.withdrawnAt)));
    return { ...section, teacherIds: teachers.map(t => t.schoolUserId),
        studentIds: members.filter(m => ownStudentId === undefined || m.studentId === ownStudentId).map(m => m.studentId),
        studentCount: members.length, needsSetup: [
            !section.code && "Chưa có mã học phần", !section.subjectId && "Chưa liên kết môn học",
            !section.semesterId && "Chưa liên kết học kỳ", !section.roomId && "Chưa liên kết phòng học",
        ].filter(Boolean) };
}
router.get("/academic/sections", academicAction(async (_req, res) => {
    const user = currentSchoolUser(res);
    const allowed = user.role === "student" ? await studentSectionIds(user) : await accessibleClassIds(user);
    const sections = await db.select().from(classroomsTable);
    const scoped = sections.filter(s => allowed === null || allowed.includes(s.id));
    res.json(api.ListAcademicSectionsResponse.parse(await Promise.all(scoped.map(s => sectionPayload(db, s.id, user.role === "student" ? user.studentId ?? -1 : undefined)))));
}));
type SectionInput = ReturnType<typeof api.CreateAcademicSectionBody.parse>;
async function saveSection(input: SectionInput, id?: number) {
    if (!input.code.trim() || !input.name.trim())
        fail(400, "Mã và tên lớp không được để trống.");
    if (new Set(input.studentIds).size !== input.studentIds.length || new Set(input.teacherIds).size !== input.teacherIds.length) {
        fail(400, "Danh sách sinh viên hoặc giảng viên bị trùng.");
    }
    return db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [old] = id ? await tx.select().from(classroomsTable).where(eq(classroomsTable.id, id)) : [];
        if (id && !old)
            fail(404, "Không tìm thấy lớp học phần.");
        const subject = await catalogRef(tx, input.subjectId, "subjects", old?.subjectId === input.subjectId);
        const semester = await catalogRef(tx, input.semesterId, "semesters", old?.semesterId === input.semesterId);
        const room = await catalogRef(tx, input.roomId, "rooms", old?.roomId === input.roomId);
        if (input.active && (!subject.active || !semester.active || !room.active))
            fail(400, "Lớp hoạt động cần môn, học kỳ và phòng chưa bị lưu trữ.");
        const teachers = input.teacherIds.length ? await tx.select().from(schoolUsersTable).where(inArray(schoolUsersTable.id, input.teacherIds)) : [];
        if (teachers.length !== input.teacherIds.length || teachers.some(t => t.role !== "teacher" || !t.active)) {
            fail(400, "Chỉ phân công tài khoản giảng viên đang hoạt động.");
        }
        const students = input.studentIds.length ? await tx.select().from(studentsTable).where(inArray(studentsTable.id, input.studentIds)) : [];
        const previous = id ? await tx.select().from(courseEnrollmentsTable)
            .where(and(eq(courseEnrollmentsTable.classId, id), isNull(courseEnrollmentsTable.withdrawnAt))) : [];
        const previousIds = new Set(previous.map(e => e.studentId));
        if (students.length !== input.studentIds.length || students.some(s => !s.active && !previousIds.has(s.id)))
            fail(400, "Sinh viên không tồn tại hoặc đã ngừng hoạt động.");
        if (old) {
            const sessions = await tx.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.classId, old.id));
            if (sessions.length && ((old.subjectId && old.subjectId !== input.subjectId) || (old.semesterId && old.semesterId !== input.semesterId))) {
                fail(409, "Lớp đã có lịch sử điểm danh; không thể đổi môn hoặc học kỳ. Hãy tạo lớp học phần mới.");
            }
            const future = (await tx.select().from(academicLessonsTable).where(eq(academicLessonsTable.classId, old.id)))
                .filter(l => l.status === "scheduled" && l.endsAt > new Date());
            if (old.semesterId && old.semesterId !== input.semesterId && future.length)
                fail(409, "Lớp đã có lịch; không đổi học kỳ trước khi xử lý các buổi học.");
            if (!input.active && (future.length || sessions.some(s => s.status === "active")))
                fail(409, "Hãy đóng phiên và hủy các buổi sắp tới trước khi lưu trữ lớp.");
            if (future.some(l => !input.teacherIds.includes(l.teacherId)))
                fail(409, "Giảng viên còn buổi dạy sắp tới. Hãy phân công lại từng buổi trước.");
            await assertNoConflicts(tx, future, undefined, { classId: old.id, studentIds: input.studentIds });
        }
        const values = { code: input.code.trim().toUpperCase(), name: input.name.trim(),
            subjectId: input.subjectId, semesterId: input.semesterId, roomId: input.roomId, active: input.active,
            subject: subject.name, room: room.name, latitude: room.latitude, longitude: room.longitude,
            checkInRadiusMeters: room.checkInRadiusMeters };
        const [saved] = old ? await tx.update(classroomsTable).set(values).output().where(eq(classroomsTable.id, old.id))
            : await tx.insert(classroomsTable).output().values(values);
        const classId = saved!.id;
        await tx.delete(teacherClassAssignmentsTable).where(eq(teacherClassAssignmentsTable.classId, classId));
        if (input.teacherIds.length)
            await tx.insert(teacherClassAssignmentsTable).values(input.teacherIds.map(schoolUserId => ({ classId, schoolUserId })));
        const removed = previous.filter(e => !input.studentIds.includes(e.studentId));
        if (removed.length)
            await tx.update(courseEnrollmentsTable).set({ withdrawnAt: new Date() }).where(inArray(courseEnrollmentsTable.id, removed.map(e => e.id)));
        for (const studentId of input.studentIds.filter(s => !previousIds.has(s))) {
            await _upsertReturning(tx, courseEnrollmentsTable, { classId, studentId }, {
                target: [courseEnrollmentsTable.classId, courseEnrollmentsTable.studentId],
                set: { enrolledAt: new Date(), withdrawnAt: null },
            });
        }
        return sectionPayload(tx, classId);
    });
}
router.post("/academic/sections", requireRole("admin"), academicAction(async (req, res) => {
    res.status(201).json(api.CreateAcademicSectionResponse.parse(await saveSection(api.CreateAcademicSectionBody.parse(req.body))));
}));
router.patch("/academic/sections/:id", requireRole("admin"), academicAction(async (req, res) => {
    const { id } = api.UpdateAcademicSectionParams.parse(req.params);
    res.json(api.UpdateAcademicSectionResponse.parse(await saveSection(api.UpdateAcademicSectionBody.parse(req.body), id)));
}));
export default router;
