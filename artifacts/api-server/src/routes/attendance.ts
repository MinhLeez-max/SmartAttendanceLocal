import { sqlErrorCode as _sqlErrorCode } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, ne, sql, } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import { CloseAttendanceSessionParams, CloseAttendanceSessionResponse, CreateClassBody, CreateClassStudentBody, CreateClassStudentParams, CreateClassStudentResponse, CreateClassResponse, SetClassLocationBody, SetClassLocationParams, SetClassLocationResponse, CreateAttendanceSessionResponse, CreateCountSnapshotBody, CreateCountSnapshotParams, CreateCountSnapshotResponse, CreateAttendanceSessionBody, CreateSessionCheckInBody, CreateSessionCheckInParams, CreateSessionCheckInResponse, GetAttendanceOverviewResponse, GetAttendanceReportQueryParams, GetAttendanceReportResponse, GetAttendanceSessionParams, GetAttendanceSessionResponse, GetSessionReconciliationParams, GetSessionReconciliationResponse, ListAttendanceSessionsQueryParams, ListAttendanceSessionsResponse, ListClassStudentsParams, ListClassStudentsResponse, ListClassesResponse, ListSessionCheckInsParams, ListSessionCheckInsResponse, UpdateAttendanceRecordParams, UpdateAttendanceRecordBody, UpdateAttendanceRecordResponse, } from "@workspace/api-zod";
import { attendanceRecordsTable, attendanceSessionsTable, classroomsTable, countSnapshotsTable, db, studentsTable, attendanceAuditsTable, academicLessonsTable, courseEnrollmentsTable, } from "@workspace/db";
import { academicAction, assertStaffSection, enrolledStudents, studentInSection, fail } from "../lib/academic-domain";
import { recordedAttendanceStats } from "../lib/attendance-statistics";
import { openAttendance } from "../lib/open-attendance";
import { accessibleClassIds, currentSchoolUser, ensureClassAccess, requireRole, } from "../middlewares/schoolAuth";
const router: IRouter = Router();
const QR_TTL_MS = 45000;
const REVIEW_DIFFERENCE = 2;
const REVIEW_CONFIDENCE = 0.65;
function iso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}
async function getClassCounts(classId: number, sessionId: number): Promise<{
    studentCount: number;
    checkedInCount: number;
}> {
    const [session] = await db.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, sessionId));
    const roster = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.sessionId, sessionId));
    const [checkInResult] = await db
        .select({ value: count() })
        .from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.sessionId, sessionId), ne(attendanceRecordsTable.status, "absent")));
    return {
        studentCount: session?.rosterCaptured ? roster.length : (await enrolledStudents(db, classId)).length,
        checkedInCount: Number(checkInResult?.value ?? 0),
    };
}
async function getSessionPayload(sessionId: number) {
    const [joined] = await db
        .select({
        session: attendanceSessionsTable,
        classroom: classroomsTable,
    })
        .from(attendanceSessionsTable)
        .innerJoin(classroomsTable, eq(attendanceSessionsTable.classId, classroomsTable.id))
        .where(eq(attendanceSessionsTable.id, sessionId));
    if (!joined) {
        return null;
    }
    let session = joined.session;
    const [lesson] = session.lessonId ? await db.select().from(academicLessonsTable).where(eq(academicLessonsTable.id, session.lessonId)) : [];
    if (lesson && session.status === "active" && lesson.endsAt <= new Date()) {
        const [closed] = await db.update(attendanceSessionsTable).set({ status: "closed", endedAt: lesson.endsAt }).output().where(eq(attendanceSessionsTable.id, sessionId));
        session = closed!;
    }
    if (session.status === "active" &&
        session.qrExpiresAt.getTime() <= Date.now()) {
        const nextToken = randomUUID();
        const nextExpiry = new Date(Math.min(Date.now() + QR_TTL_MS, lesson?.endsAt.getTime() ?? Infinity));
        const [updated] = await db
            .update(attendanceSessionsTable)
            .set({ qrToken: nextToken, qrExpiresAt: nextExpiry }).output().where(eq(attendanceSessionsTable.id, sessionId));
        if (updated) {
            session = updated;
        }
    }
    const counts = await getClassCounts(session.classId, session.id);
    return {
        id: session.id,
        classId: session.classId,
        lessonId: session.lessonId,
        className: joined.classroom.name,
        subject: joined.classroom.subject,
        status: session.status,
        startedAt: session.startedAt.toISOString(),
        endedAt: iso(session.endedAt),
        qrToken: session.qrToken,
        qrExpiresAt: session.qrExpiresAt.toISOString(),
        studentCount: counts.studentCount,
        checkedInCount: counts.checkedInCount,
    };
}
async function getClassroomPayload(classroom: typeof classroomsTable.$inferSelect) {
    const roster = await enrolledStudents(db, classroom.id);
    return {
        id: classroom.id,
        name: classroom.name,
        subject: classroom.subject,
        room: classroom.room,
        latitude: classroom.latitude,
        longitude: classroom.longitude,
        checkInRadiusMeters: classroom.checkInRadiusMeters,
        studentCount: roster.length,
    };
}
async function ensureSessionAccess(res: Response, sessionId: number): Promise<boolean> {
    const [session] = await db
        .select({ classId: attendanceSessionsTable.classId }).top(1).from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.id, sessionId));
    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return false;
    }
    return ensureClassAccess(res, session.classId);
}
router.get("/attendance/overview", async (req, res): Promise<void> => {
    const allowedIds = await accessibleClassIds(currentSchoolUser(res));
    const [allClassrooms, allStudents, allSessions, allRecords] = await Promise.all([
        db.select().from(classroomsTable),
        db.select().from(studentsTable),
        db
            .select()
            .from(attendanceSessionsTable)
            .orderBy(desc(attendanceSessionsTable.startedAt)),
        db.select().from(attendanceRecordsTable),
    ]);
    const allowedSet = allowedIds === null ? null : new Set(allowedIds);
    const classrooms = allowedSet === null
        ? allClassrooms
        : allClassrooms.filter((classroom) => allowedSet.has(classroom.id));
    const classIds = new Set(classrooms.map((classroom) => classroom.id));
    const enrollmentRows = await db.select().from(courseEnrollmentsTable);
    const students = allStudents.filter(student => enrollmentRows.some(e => e.studentId === student.id && classIds.has(e.classId) && !e.withdrawnAt));
    const sessions = allSessions.filter((session) => classIds.has(session.classId));
    const sessionIds = new Set(sessions.map((session) => session.id));
    const records = allRecords.filter((record) => sessionIds.has(record.sessionId));
    const recentSessions = sessions.slice(0, 8);
    const sessionPayloads = await Promise.all(recentSessions.map((session) => getSessionPayload(session.id)));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayCount = sessions.filter((session) => session.startedAt.getTime() >= today.getTime()).length;
    const overviewStats = recordedAttendanceStats(records, sessions.map(s => s.id));
    const activities = sessions.slice(0, 4).map((session, index) => {
        const classroom = classrooms.find((candidate) => candidate.id === session.classId);
        return {
            id: session.id,
            message: session.status === "active"
                ? `Đang diễn ra điểm danh ${classroom?.name ?? "lớp học"}`
                : `Đã kết thúc điểm danh ${classroom?.name ?? "lớp học"}`,
            createdAt: (index === 0 ? session.startedAt : session.endedAt ?? session.startedAt).toISOString(),
        };
    });
    const activeSession = sessionPayloads.find((session) => session?.status === "active") ?? null;
    res.json(GetAttendanceOverviewResponse.parse({
        classCount: classrooms.length,
        studentCount: students.length,
        sessionsToday: todayCount,
        averageAttendanceRate: overviewStats.rate,
        activeSession,
        recentSessions: sessionPayloads.filter(Boolean).slice(0, 5),
        activities,
    }));
});
router.get("/classes", async (_req, res): Promise<void> => {
    const allowedIds = await accessibleClassIds(currentSchoolUser(res));
    const allClassrooms = await db.select().from(classroomsTable);
    const classrooms = allowedIds === null
        ? allClassrooms
        : allClassrooms.filter((classroom) => allowedIds.includes(classroom.id));
    const payload = await Promise.all(classrooms.map(getClassroomPayload));
    res.json(ListClassesResponse.parse(payload));
});
router.post("/classes", requireRole("admin"), async (req, res): Promise<void> => {
    const input = CreateClassBody.safeParse(req.body);
    if (!input.success) {
        req.log.warn({ errors: input.error.message }, "Invalid class input");
        res.status(400).json({ error: input.error.message });
        return;
    }
    const [classroom] = await db
        .insert(classroomsTable).output().values(input.data);
    const payload = await getClassroomPayload(classroom);
    res.status(201).json(CreateClassResponse.parse(payload));
});
router.patch("/classes/:classId/location", requireRole("admin"), async (req, res): Promise<void> => {
    const params = SetClassLocationParams.safeParse(req.params);
    const input = SetClassLocationBody.safeParse(req.body);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    const [classroom] = await db
        .update(classroomsTable)
        .set(input.data).output().where(eq(classroomsTable.id, params.data.classId));
    if (!classroom) {
        res.status(404).json({ error: "Class not found" });
        return;
    }
    const payload = await getClassroomPayload(classroom);
    res.json(SetClassLocationResponse.parse(payload));
});
router.get("/classes/:classId/students", async (req, res): Promise<void> => {
    const params = ListClassStudentsParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!(await ensureClassAccess(res, params.data.classId))) {
        return;
    }
    const students = await enrolledStudents(db, params.data.classId);
    const sessions = await db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.classId, params.data.classId));
    const records = await db.select().from(attendanceRecordsTable);
    const payload = students.map((student) => {
        const stats = recordedAttendanceStats(records, sessions.filter(s => s.status === "closed").map(s => s.id), student.id);
        return {
            id: student.id,
            classId: student.classId,
            fullName: student.fullName,
            studentCode: student.studentCode,
            attendanceRate: stats.rate,
        };
    });
    res.json(ListClassStudentsResponse.parse(payload));
});
router.post("/classes/:classId/students", requireRole("admin"), async (req, res): Promise<void> => {
    const params = CreateClassStudentParams.safeParse(req.params);
    const input = CreateClassStudentBody.safeParse(req.body);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    if (!(await ensureClassAccess(res, params.data.classId))) {
        return;
    }
    const [classroom] = await db
        .select({ id: classroomsTable.id }).top(1).from(classroomsTable)
        .where(eq(classroomsTable.id, params.data.classId));
    if (!classroom) {
        res.status(404).json({ error: "Class not found" });
        return;
    }
    try {
        const student = await db.transaction(async (tx) => {
            const [saved] = await tx.insert(studentsTable).output().values({
                classId: params.data.classId,
                fullName: input.data.fullName.trim(),
                studentCode: input.data.studentCode.trim().toUpperCase(),
            });
            await tx.insert(courseEnrollmentsTable).values({ classId: params.data.classId, studentId: saved!.id });
            return saved!;
        });
        res.status(201).json(CreateClassStudentResponse.parse({
            id: student.id,
            classId: student.classId,
            fullName: student.fullName,
            studentCode: student.studentCode,
            attendanceRate: null,
        }));
    }
    catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
            ? String(error.code)
            : "";
        if (_sqlErrorCode(error) === "23505") {
            res.status(409).json({ error: "Mã học sinh này đã tồn tại." });
            return;
        }
        throw error;
    }
});
router.get("/sessions", async (req, res): Promise<void> => {
    const query = ListAttendanceSessionsQueryParams.safeParse(req.query);
    if (!query.success) {
        res.status(400).json({ error: query.error.message });
        return;
    }
    if (query.data.classId !== undefined &&
        !(await ensureClassAccess(res, query.data.classId))) {
        return;
    }
    const allowedIds = await accessibleClassIds(currentSchoolUser(res));
    if (query.data.classId === undefined && allowedIds !== null && !allowedIds.length) {
        res.json(ListAttendanceSessionsResponse.parse([]));
        return;
    }
    const sessions = await db
        .select()
        .from(attendanceSessionsTable)
        .where(query.data.classId !== undefined
        ? eq(attendanceSessionsTable.classId, query.data.classId)
        : allowedIds === null
            ? undefined
            : inArray(attendanceSessionsTable.classId, allowedIds))
        .orderBy(desc(attendanceSessionsTable.startedAt));
    const payload = await Promise.all(sessions.map((session) => getSessionPayload(session.id)));
    res.json(ListAttendanceSessionsResponse.parse(payload.filter(Boolean)));
});
router.post("/sessions", academicAction(async (req, res): Promise<void> => {
    const input = CreateAttendanceSessionBody.safeParse(req.body);
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    if (!(await ensureClassAccess(res, input.data.classId))) {
        return;
    }
    const id = await openAttendance(currentSchoolUser(res), input.data.classId, input.data.lessonId);
    const payload = await getSessionPayload(id);
    res.status(201).json(CreateAttendanceSessionResponse.parse(payload));
}));
router.get("/sessions/:sessionId", async (req, res): Promise<void> => {
    const params = GetAttendanceSessionParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
        return;
    }
    const payload = await getSessionPayload(params.data.sessionId);
    if (!payload) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    res.json(GetAttendanceSessionResponse.parse(payload));
});
router.post("/sessions/:sessionId/close", academicAction(async (req, res): Promise<void> => {
    const params = CloseAttendanceSessionParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
        return;
    }
    const updated = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [session] = await tx.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, params.data.sessionId));
        if (session)
            await assertStaffSection(tx, currentSchoolUser(res).id, session.classId);
        if (session?.status === "closed")
            return session;
        const [saved] = await tx.update(attendanceSessionsTable).set({ status: "closed", endedAt: new Date() }).output().where(eq(attendanceSessionsTable.id, params.data.sessionId));
        return saved;
    });
    if (!updated) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    const payload = await getSessionPayload(updated.id);
    res.json(CloseAttendanceSessionResponse.parse(payload));
}));
router.get("/sessions/:sessionId/check-ins", async (req, res): Promise<void> => {
    const params = ListSessionCheckInsParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
        return;
    }
    const records = await db
        .select({
        record: attendanceRecordsTable,
        student: studentsTable,
    })
        .from(attendanceRecordsTable)
        .innerJoin(studentsTable, eq(attendanceRecordsTable.studentId, studentsTable.id))
        .where(eq(attendanceRecordsTable.sessionId, params.data.sessionId));
    const payload = records.map(({ record, student }) => ({
        id: record.id,
        sessionId: record.sessionId,
        studentId: record.studentId,
        studentName: student.fullName,
        studentCode: student.studentCode,
        status: record.status,
        checkedInAt: iso(record.checkedInAt),
        updatedAt: record.updatedAt.toISOString(),
    }));
    res.json(ListSessionCheckInsResponse.parse(payload));
});
router.post("/sessions/:sessionId/check-ins", academicAction(async (req, res): Promise<void> => {
    const params = CreateSessionCheckInParams.safeParse(req.params);
    const input = CreateSessionCheckInBody.safeParse(req.body);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
        return;
    }
    const [session] = await db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.id, params.data.sessionId));
    if (!session ||
        session.status !== "active" ||
        session.qrToken !== input.data.qrToken ||
        session.qrExpiresAt.getTime() <= Date.now()) {
        res.status(400).json({ error: "QR is invalid, expired, or closed" });
        return;
    }
    const [student] = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.studentCode, input.data.studentCode.trim().toUpperCase()));
    if (!student || !(await studentInSection(student.id, session.classId))) {
        res.status(400).json({ error: "Student is not in this class" });
        return;
    }
    const [existing] = await db
        .select()
        .from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.sessionId, session.id), eq(attendanceRecordsTable.studentId, student.id)));
    if (existing && (existing.status !== "absent" || existing.note !== null || existing.checkedInAt !== null)) {
        res.status(400).json({ error: "Student has already checked in" });
        return;
    }
    if (session.rosterCaptured && !existing)
        fail(403, "Sinh viên không có trong danh sách phiên đã mở.");
    if (input.data.note.trim().length < 3)
        fail(400, "Cần lý do ghi nhận thủ công ít nhất 3 ký tự.");
    const now = new Date();
    const record = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [freshSession] = await tx.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, session.id));
        await assertStaffSection(tx, currentSchoolUser(res).id, session.classId);
        if (freshSession?.status !== "active" || freshSession.qrToken !== input.data.qrToken || freshSession.qrExpiresAt <= new Date())
            fail(409, "Phiên hoặc mã QR đã thay đổi; hãy thử lại.");
        const [fresh] = await tx.select().from(attendanceRecordsTable).where(and(eq(attendanceRecordsTable.sessionId, session.id), eq(attendanceRecordsTable.studentId, student.id)));
        if (fresh && (fresh.status !== "absent" || fresh.note !== null || fresh.checkedInAt !== null))
            fail(409, "Sinh viên đã có kết quả; hãy dùng điều chỉnh kèm lý do.");
        const values = { status: "present", checkedInAt: now, updatedAt: now, note: input.data.note.trim() };
        const [saved] = fresh ? await tx.update(attendanceRecordsTable).set(values).output().where(eq(attendanceRecordsTable.id, fresh.id))
            : await tx.insert(attendanceRecordsTable).output().values({ ...values, sessionId: session.id, studentId: student.id });
        const actor = currentSchoolUser(res);
        await tx.insert(attendanceAuditsTable).values({ recordId: saved!.id, actorId: actor.id, actorName: actor.displayName,
            beforeStatus: fresh?.status ?? "unrecorded", afterStatus: "present", reason: input.data.note.trim() });
        return saved!;
    });
    res.status(201).json(CreateSessionCheckInResponse.parse({
        id: record.id,
        sessionId: record.sessionId,
        studentId: record.studentId,
        studentName: student.fullName,
        studentCode: student.studentCode,
        status: record.status,
        checkedInAt: iso(record.checkedInAt),
        updatedAt: record.updatedAt.toISOString(),
    }));
}));
router.patch("/attendance/:recordId", academicAction(async (req, res): Promise<void> => {
    const params = UpdateAttendanceRecordParams.safeParse(req.params);
    const input = UpdateAttendanceRecordBody.safeParse(req.body);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    if (input.data.note.trim().length < 3)
        fail(400, "Cần lý do điều chỉnh ít nhất 3 ký tự.");
    const [existingRecord] = await db
        .select().top(1).from(attendanceRecordsTable)
        .where(eq(attendanceRecordsTable.id, params.data.recordId));
    if (!existingRecord) {
        res.status(404).json({ error: "Attendance record not found" });
        return;
    }
    if (!(await ensureSessionAccess(res, existingRecord.sessionId))) {
        return;
    }
    const updated = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [fresh] = await tx.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.id, params.data.recordId));
        const [session] = await tx.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, existingRecord.sessionId));
        const actor = await assertStaffSection(tx, currentSchoolUser(res).id, session!.classId);
        await tx.insert(attendanceAuditsTable).values({
            recordId: fresh!.id, actorId: actor.id, actorName: actor.displayName,
            beforeStatus: fresh!.status, afterStatus: input.data.status, reason: input.data.note.trim(),
        });
        const [saved] = await tx.update(attendanceRecordsTable).set({
            status: input.data.status, note: input.data.note.trim(),
            checkedInAt: input.data.status === "absent" ? null : fresh!.checkedInAt ?? new Date(), updatedAt: new Date(),
        }).output().where(eq(attendanceRecordsTable.id, params.data.recordId));
        return saved;
    });
    if (!updated) {
        res.status(404).json({ error: "Attendance record not found" });
        return;
    }
    const [student] = await db
        .select()
        .from(studentsTable)
        .where(eq(studentsTable.id, updated.studentId));
    if (!student) {
        res.status(404).json({ error: "Student not found" });
        return;
    }
    res.json(UpdateAttendanceRecordResponse.parse({
        id: updated.id,
        sessionId: updated.sessionId,
        studentId: updated.studentId,
        studentName: student.fullName,
        studentCode: student.studentCode,
        status: updated.status,
        checkedInAt: iso(updated.checkedInAt),
        updatedAt: updated.updatedAt.toISOString(),
    }));
}));
router.post("/sessions/:sessionId/counts", async (req, res): Promise<void> => {
    const params = CreateCountSnapshotParams.safeParse(req.params);
    const input = CreateCountSnapshotBody.safeParse(req.body);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
        return;
    }
    const [session] = await db
        .select()
        .from(attendanceSessionsTable)
        .where(eq(attendanceSessionsTable.id, params.data.sessionId));
    if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    if (session.status !== "active") {
        res.status(400).json({ error: "Cannot save a camera count for a closed session" });
        return;
    }
    const [snapshot] = await db
        .insert(countSnapshotsTable).output().values({
        sessionId: session.id,
        estimatedCount: input.data.estimatedCount,
        confidence: input.data.confidence,
        source: input.data.source,
    });
    res.status(201).json(CreateCountSnapshotResponse.parse({
        id: snapshot.id,
        sessionId: snapshot.sessionId,
        estimatedCount: snapshot.estimatedCount,
        confidence: snapshot.confidence,
        source: snapshot.source,
        capturedAt: snapshot.capturedAt.toISOString(),
    }));
});
router.get("/sessions/:sessionId/reconciliation", async (req, res): Promise<void> => {
    const params = GetSessionReconciliationParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!(await ensureSessionAccess(res, params.data.sessionId))) {
        return;
    }
    const payload = await getSessionPayload(params.data.sessionId);
    if (!payload) {
        res.status(404).json({ error: "Session not found" });
        return;
    }
    const [latestSnapshot] = await db
        .select().top(1).from(countSnapshotsTable)
        .where(eq(countSnapshotsTable.sessionId, params.data.sessionId))
        .orderBy(desc(countSnapshotsTable.capturedAt));
    const difference = latestSnapshot
        ? latestSnapshot.estimatedCount - payload.checkedInCount
        : null;
    const needsReview = latestSnapshot !== undefined &&
        latestSnapshot.confidence >= REVIEW_CONFIDENCE &&
        Math.abs(difference ?? 0) >= REVIEW_DIFFERENCE;
    const message = !latestSnapshot
        ? "Chưa có số liệu đếm từ camera cho buổi học này."
        : needsReview
            ? "Số lượt QR và số người ước lượng đang chênh lệch. Giáo viên cần kiểm tra thủ công."
            : "Số liệu hiện tại chưa có chênh lệch đáng kể. Kết quả camera chỉ mang tính tham khảo.";
    res.json(GetSessionReconciliationResponse.parse({
        sessionId: params.data.sessionId,
        checkedInCount: payload.checkedInCount,
        estimatedCount: latestSnapshot?.estimatedCount ?? null,
        difference,
        confidence: latestSnapshot?.confidence ?? null,
        source: latestSnapshot?.source ?? null,
        capturedAt: iso(latestSnapshot?.capturedAt ?? null),
        needsReview,
        message,
    }));
});
router.get("/reports/attendance", async (req, res): Promise<void> => {
    const query = GetAttendanceReportQueryParams.safeParse(req.query);
    if (!query.success) {
        res.status(400).json({ error: query.error.message });
        return;
    }
    if (query.data.classId !== undefined &&
        !(await ensureClassAccess(res, query.data.classId))) {
        return;
    }
    const allowedIds = await accessibleClassIds(currentSchoolUser(res));
    if (query.data.classId === undefined && allowedIds !== null && !allowedIds.length) {
        res.json(GetAttendanceReportResponse.parse({
            overallAttendanceRate: null,
            totalSessions: 0,
            rows: [],
        }));
        return;
    }
    const classes = await db.select().from(classroomsTable);
    const selectedClasses = (query.data.classId === undefined
        ? allowedIds === null
            ? classes
            : classes.filter((classroom) => allowedIds.includes(classroom.id))
        : classes.filter((classroom) => classroom.id === query.data.classId)).filter(c => (!query.data.semesterId || c.semesterId === query.data.semesterId) &&
        (!query.data.subjectId || c.subjectId === query.data.subjectId));
    const [students, allSessions, records] = await Promise.all([
        db.select().from(studentsTable),
        db.select().from(attendanceSessionsTable),
        db.select().from(attendanceRecordsTable),
    ]);
    const sessions = allSessions.filter((session) => session.status === "closed");
    const enrollments = await db.select().from(courseEnrollmentsTable);
    const rows = selectedClasses.map((classroom) => {
        const classStudents = students.filter((student) => (!query.data.studentId || student.id === query.data.studentId) &&
            enrollments.some(e => e.classId === classroom.id && e.studentId === student.id && !e.withdrawnAt));
        const classSessions = sessions.filter((session) => session.classId === classroom.id);
        const stats = recordedAttendanceStats(records, classSessions.map(s => s.id), query.data.studentId);
        const attended = stats.attended;
        const possible = stats.recordedCount;
        return {
            classId: classroom.id,
            className: classroom.name,
            studentCount: classStudents.length,
            attendanceRate: stats.rate,
            sessionsCount: classSessions.length,
            possible,
            attended,
        };
    });
    const totalPossible = rows.reduce((total, row) => total + row.possible, 0);
    const totalAttended = rows.reduce((total, row) => total +
        row.attended, 0);
    res.json(GetAttendanceReportResponse.parse({
        overallAttendanceRate: totalPossible === 0
            ? null
            : Math.round((totalAttended / totalPossible) * 1000) / 10,
        totalSessions: rows.reduce((total, row) => total + row.sessionsCount, 0),
        rows,
    }));
});
export default router;
