import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import * as api from "@workspace/api-zod";
import { db, academicLessonsTable, classroomsTable, teacherClassAssignmentsTable, schoolUsersTable, attendanceSessionsTable } from "@workspace/db";
import { accessibleClassIds, currentSchoolUser, requireRole } from "../middlewares/schoolAuth";
import { academicAction, assertNoConflicts, calendarDate, catalogRef, fail, lessonPayloads, lessonTimes, seriesDates, studentSectionIds, type AcademicTx } from "../lib/academic-domain";
const router: IRouter = Router();
async function lessonReferences(tx: AcademicTx, classId: number, teacherId: number, roomId: number, date: string) {
    const [section] = await tx.select().from(classroomsTable).where(eq(classroomsTable.id, classId));
    if (!section?.active || !section.semesterId)
        fail(400, "Lớp chưa được cấu hình học kỳ hoặc đã ngừng sử dụng.");
    const semester = await catalogRef(tx, section.semesterId, "semesters");
    if (!section.subjectId)
        fail(400, "Lớp chưa liên kết môn học.");
    await catalogRef(tx, section.subjectId, "subjects");
    if (!semester.startDate || !semester.endDate || date < semester.startDate || date > semester.endDate)
        fail(400, "Ngày học nằm ngoài học kỳ.");
    await catalogRef(tx, roomId, "rooms");
    const [teacher] = await tx.select().from(schoolUsersTable).where(eq(schoolUsersTable.id, teacherId));
    const [assignment] = await tx.select().from(teacherClassAssignmentsTable).where(and(eq(teacherClassAssignmentsTable.classId, classId), eq(teacherClassAssignmentsTable.schoolUserId, teacherId)));
    if (!teacher?.active || teacher.role !== "teacher" || !assignment)
        fail(400, "Giảng viên không hoạt động hoặc chưa được phân công lớp này.");
}
router.get("/academic/lessons", academicAction(async (req, res) => {
    const query = api.ListAcademicLessonsQueryParams.parse(req.query);
    const user = currentSchoolUser(res);
    const allowed = user.role === "student" ? await studentSectionIds(user) : await accessibleClassIds(user);
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const date = query.weekStart ?? today;
    calendarDate(date);
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 7 * 86400000);
    const rows = (await lessonPayloads()).filter(l => (allowed === null || allowed.includes(l.classId)) &&
        (user.role !== "teacher" || l.teacherId === user.id) &&
        (!query.classId || l.classId === query.classId) && l.startsAt >= start && l.startsAt < end)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    res.json(api.ListAcademicLessonsResponse.parse(rows));
}));
router.post("/academic/lessons", requireRole("admin"), academicAction(async (req, res) => {
    const input = api.CreateAcademicLessonsBody.parse(req.body);
    const dates = seriesDates(input.startDate, input.endDate, input.weekday);
    const ids = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const lessons = [];
        for (const date of dates) {
            await lessonReferences(tx, input.classId, input.teacherId, input.roomId, date);
            lessons.push({ classId: input.classId, teacherId: input.teacherId, roomId: input.roomId, ...lessonTimes(date, input.startsAt, input.endsAt) });
        }
        await assertNoConflicts(tx, lessons);
        return (await tx.insert(academicLessonsTable).output({ id: academicLessonsTable.id }).values(lessons)).map(r => r.id);
    });
    res.status(201).json(api.CreateAcademicLessonsResponse.parse((await lessonPayloads()).filter(l => ids.includes(l.id))));
}));
router.patch("/academic/lessons/:id", requireRole("admin"), academicAction(async (req, res) => {
    const { id } = api.UpdateAcademicLessonParams.parse(req.params);
    const input = api.UpdateAcademicLessonBody.parse(req.body);
    if (input.reason.trim().length < 3)
        fail(400, "Cần lý do thay đổi ít nhất 3 ký tự.");
    await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [old] = await tx.select().from(academicLessonsTable).where(eq(academicLessonsTable.id, id));
        if (!old)
            fail(404, "Không tìm thấy buổi học.");
        const [session] = await tx.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.lessonId, id));
        if (session || old.startsAt <= new Date())
            fail(409, "Không sửa/hủy buổi đã điểm danh hoặc đã bắt đầu; lịch sử được giữ nguyên.");
        const times = lessonTimes(input.date, input.startsAt, input.endsAt);
        if (input.status !== "cancelled") {
            await lessonReferences(tx, old.classId, input.teacherId, input.roomId, input.date);
            await assertNoConflicts(tx, [{ classId: old.classId, teacherId: input.teacherId, roomId: input.roomId, ...times }], id);
        }
        await tx.update(academicLessonsTable).set(input.status === "cancelled" ? {
            status: "cancelled", reason: input.reason.trim(),
        } : { ...times, teacherId: input.teacherId, roomId: input.roomId,
            status: input.status, reason: input.reason.trim() }).where(eq(academicLessonsTable.id, id));
    });
    res.json(api.UpdateAcademicLessonResponse.parse((await lessonPayloads()).find(l => l.id === id)));
}));
export default router;
