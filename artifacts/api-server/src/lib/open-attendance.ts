import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, classroomsTable, attendanceSessionsTable, attendanceRecordsTable, academicLessonsTable, teacherClassAssignmentsTable, schoolUsersTable } from "@workspace/db";
import { catalogRef, enrolledStudents, expireOverdueLessonSessions, fail } from "./academic-domain";
import type { SchoolUserRecord } from "../middlewares/schoolAuth";
export async function openAttendance(user: SchoolUserRecord, classId: number, lessonId?: number) {
    return db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        await expireOverdueLessonSessions(tx);
        const [account] = await tx.select().from(schoolUsersTable).where(eq(schoolUsersTable.id, user.id));
        if (!account?.active || !["admin", "teacher"].includes(account.role))
            fail(403, "Tài khoản không còn quyền mở điểm danh.");
        if (account.role === "teacher") {
            const [assignment] = await tx.select().from(teacherClassAssignmentsTable)
                .where(and(eq(teacherClassAssignmentsTable.classId, classId), eq(teacherClassAssignmentsTable.schoolUserId, user.id)));
            if (!assignment)
                fail(403, "Lớp chưa được phân công cho bạn.");
        }
        const [section] = await tx.select().from(classroomsTable).where(eq(classroomsTable.id, classId));
        if (!section?.active)
            fail(400, "Lớp không tồn tại hoặc đã ngừng sử dụng.");
        const [lesson] = lessonId ? await tx.select().from(academicLessonsTable).where(eq(academicLessonsTable.id, lessonId)) : [];
        if (lessonId && (!lesson || lesson.classId !== classId || lesson.status !== "scheduled"))
            fail(400, "Buổi học không hợp lệ hoặc đã hủy.");
        if (!lesson && section.semesterId)
            fail(400, "Hãy chọn buổi học trong lịch dạy để mở điểm danh.");
        if (lesson && account.role === "teacher" && lesson.teacherId !== account.id)
            fail(403, "Buổi này được phân công cho giảng viên khác.");
        const room = lesson ? await catalogRef(tx, lesson.roomId, "rooms") : section;
        if (room.latitude === null || room.longitude === null)
            fail(409, "Quản trị viên cần thiết lập tọa độ phòng trước khi mở điểm danh.");
        const now = new Date();
        const [existingLesson] = lesson ? await tx.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.lessonId, lesson.id)) : [];
        if (existingLesson) {
            if (existingLesson.status === "closed")
                fail(409, "Buổi học đã kết thúc điểm danh; không mở lại để tránh ghi nhận trùng.");
            if (lesson!.endsAt <= now)
                fail(409, "Buổi học đã hết giờ.");
            return existingLesson.id;
        }
        if (lesson && (now.getTime() < lesson.startsAt.getTime() - 30 * 60000 || now >= lesson.endsAt)) {
            fail(409, "Chỉ mở điểm danh từ 30 phút trước giờ học đến giờ kết thúc buổi.");
        }
        const active = await tx.select().from(attendanceSessionsTable).where(and(eq(attendanceSessionsTable.classId, classId), eq(attendanceSessionsTable.status, "active")));
        if (active.length) {
            if (!lesson && active[0]!.lessonId === null)
                return active[0]!.id;
            fail(409, "Lớp đang có phiên điểm danh khác. Hãy đóng phiên trước.");
        }
        const roster = await enrolledStudents(tx, classId);
        if (!roster.length)
            fail(409, "Lớp chưa có sinh viên đang hoạt động.");
        const [session] = await tx.insert(attendanceSessionsTable).output().values({
            classId, lessonId: lesson?.id ?? null, rosterCaptured: true, status: "active", startedAt: now,
            latitude: room.latitude, longitude: room.longitude, checkInRadiusMeters: room.checkInRadiusMeters,
            qrToken: randomUUID(), qrExpiresAt: new Date(Math.min(now.getTime() + 45000, lesson?.endsAt.getTime() ?? Infinity)),
        });
        await tx.insert(attendanceRecordsTable).values(roster.map(s => ({ sessionId: session!.id, studentId: s.id, status: "absent" })));
        return session!.id;
    });
}
