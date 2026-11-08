import { and, eq, isNull, sql } from "drizzle-orm";
import { db, attendanceRecordsTable, attendanceSessionsTable, academicLessonsTable, classroomsTable, courseEnrollmentsTable, studentsTable, schoolUsersTable } from "@workspace/db";
import type { SchoolUserRecord } from "../middlewares/schoolAuth";
import { fail, type AcademicTx } from "./academic-domain";
import { distanceMeters } from "./geofence";
export async function activeQr(tx: AcademicTx | typeof db, token: string, studentId: number | null) {
    if (!studentId)
        fail(400, "Tài khoản chưa được liên kết hồ sơ sinh viên.");
    const [joined] = await tx.select({ session: attendanceSessionsTable, classroom: classroomsTable })
        .from(attendanceSessionsTable).innerJoin(classroomsTable, eq(classroomsTable.id, attendanceSessionsTable.classId))
        .where(eq(attendanceSessionsTable.qrToken, token));
    const now = new Date();
    if (!joined || joined.session.status !== "active" || joined.session.qrExpiresAt <= now || !joined.classroom.active) {
        fail(404, "Mã QR đã hết hạn hoặc buổi điểm danh đã đóng.");
    }
    if (joined.session.lessonId) {
        const [lesson] = await tx.select().from(academicLessonsTable).where(eq(academicLessonsTable.id, joined.session.lessonId));
        if (!lesson || lesson.status !== "scheduled" || now >= lesson.endsAt)
            fail(404, "Buổi học đã kết thúc hoặc đã hủy.");
    }
    const [member] = await tx.select().from(courseEnrollmentsTable)
        .where(and(eq(courseEnrollmentsTable.studentId, studentId), eq(courseEnrollmentsTable.classId, joined.session.classId), isNull(courseEnrollmentsTable.withdrawnAt)));
    const [student] = await tx.select().from(studentsTable).where(eq(studentsTable.id, studentId));
    if (!member || !student?.active)
        fail(403, "Bạn không thuộc danh sách sinh viên đang học lớp học phần này.");
    const [record] = await tx.select().from(attendanceRecordsTable)
        .where(and(eq(attendanceRecordsTable.sessionId, joined.session.id), eq(attendanceRecordsTable.studentId, studentId)));
    if (joined.session.rosterCaptured && !record)
        fail(403, "Bạn chưa có trong danh sách của phiên đã mở. Hãy liên hệ giảng viên.");
    if (joined.session.latitude === null || joined.session.longitude === null)
        fail(409, "Phiên chưa có mốc vị trí. Giảng viên cần mở phiên mới sau khi cấu hình phòng.");
    return { ...joined, student, record };
}
export async function submitQr(user: SchoolUserRecord, token: string, location: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
}) {
    return db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [freshUser] = await tx.select().from(schoolUsersTable).where(eq(schoolUsersTable.id, user.id));
        if (!freshUser?.active || freshUser.role !== "student" || freshUser.studentId !== user.studentId)
            fail(403, "Quyền hoặc hồ sơ tài khoản đã thay đổi.");
        const joined = await activeQr(tx, token, user.studentId);
        const { session, student, record } = joined;
        if (record && (record.status !== "absent" || record.checkedInAt !== null || record.note !== null))
            return { record, student, duplicate: true };
        if (location.accuracyMeters > 100)
            fail(422, `GPS chưa đủ chính xác (±${Math.round(location.accuracyMeters)} m). Hãy bật vị trí chính xác và thử lại.`);
        const distance = distanceMeters(location.latitude, location.longitude, session.latitude!, session.longitude!);
        if (!Number.isFinite(distance) || distance > session.checkInRadiusMeters)
            fail(403, `Bạn đang ở ngoài phạm vi ${session.checkInRadiusMeters} m của phòng học.`);
        const now = new Date();
        const [lesson] = session.lessonId ? await tx.select().from(academicLessonsTable).where(eq(academicLessonsTable.id, session.lessonId)) : [];
        const status = lesson && now.getTime() > lesson.startsAt.getTime() + 15 * 60000 ? "late" : "present";
        const values = { status, checkedInAt: now, updatedAt: now };
        const [saved] = record ? await tx.update(attendanceRecordsTable).set(values).output().where(eq(attendanceRecordsTable.id, record.id))
            : await tx.insert(attendanceRecordsTable).output().values({ ...values, sessionId: session.id, studentId: student.id });
        return { record: saved!, student, duplicate: false };
    });
}
