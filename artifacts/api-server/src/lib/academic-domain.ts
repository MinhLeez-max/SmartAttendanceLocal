import { sqlErrorCode as _sqlErrorCode } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db, academicCatalogTable, academicLessonsTable, classroomsTable, courseEnrollmentsTable, studentsTable, schoolUsersTable, attendanceSessionsTable, teacherClassAssignmentsTable, } from "@workspace/db";
import type { SchoolUserRecord } from "../middlewares/schoolAuth";
export type AcademicTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Caller holds the academic advisory lock. Effective end is the scheduled end, not the next page visit. */
export async function expireOverdueLessonSessions(tx: AcademicTx) {
    await tx.execute(sql `
    UPDATE session SET status = 'closed', ended_at = lesson.ends_at FROM attendance_sessions AS session INNER JOIN academic_lessons AS lesson ON session.lesson_id = lesson.id WHERE session.status = 'active' AND lesson.ends_at <= CONVERT(datetimeoffset(3), ${new Date().toISOString()})
  `);
}
export async function reconcileScheduledSessions() {
    await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        await expireOverdueLessonSessions(tx);
    });
}
export class AcademicError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function fail(status: number, message: string): never { throw new AcademicError(status, message); }
export const academicAction = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
    try {
        await handler(req, res, next);
    }
    catch (error) {
        if (error instanceof AcademicError) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        if (error instanceof Error && error.name === "ZodError") {
            res.status(400).json({ error: "Thông tin không hợp lệ. Kiểm tra các trường bắt buộc, mã, ngày và giờ." });
            return;
        }
        const cause = error as {
            code?: string;
            cause?: {
                code?: string;
            };
        };
        if (_sqlErrorCode(error) === "23505") {
            res.status(409).json({ error: "Mã định danh hoặc bản ghi đã tồn tại." });
            return;
        }
        next(error);
    }
};
export function calendarDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        fail(400, "Ngày phải có dạng YYYY-MM-DD.");
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
        fail(400, "Ngày không tồn tại.");
    return value;
}
export function lessonTimes(date: string, start: string, end: string) {
    calendarDate(date);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(start) || !time.test(end) || start >= end)
        fail(400, "Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.");
    return { startsAt: new Date(`${date}T${start}:00+07:00`), endsAt: new Date(`${date}T${end}:00+07:00`) };
}
export function seriesDates(start: string, end: string, weekday?: number | null) {
    calendarDate(start);
    calendarDate(end);
    const first = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`);
    const days = (last.getTime() - first.getTime()) / 86400000;
    if (days < 0 || days > 366)
        fail(400, "Khoảng lịch phải từ 0 đến 366 ngày.");
    if (weekday == null && start !== end)
        fail(400, "Lịch một buổi cần ngày bắt đầu và kết thúc giống nhau.");
    if (weekday != null && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6))
        fail(400, "Thứ trong tuần không hợp lệ.");
    const dates: string[] = [];
    for (let i = 0; i <= days; i++) {
        const date = new Date(first.getTime() + i * 86400000);
        if (weekday == null || date.getUTCDay() === weekday)
            dates.push(date.toISOString().slice(0, 10));
    }
    if (!dates.length)
        fail(400, "Khoảng ngày không có buổi học vào thứ đã chọn.");
    return dates;
}
export async function catalogRef(tx: AcademicTx, id: number, kind: string, allowInactive = false) {
    const [item] = await tx.select().from(academicCatalogTable).where(and(eq(academicCatalogTable.id, id), eq(academicCatalogTable.kind, kind)));
    if (!item || (!allowInactive && !item.active))
        fail(400, `Mục ${kind} không tồn tại hoặc đã ngừng sử dụng.`);
    return item;
}
export async function enrolledStudents(tx: AcademicTx | typeof db, classId: number) {
    const rows = await tx.select({ student: studentsTable }).from(courseEnrollmentsTable)
        .innerJoin(studentsTable, eq(studentsTable.id, courseEnrollmentsTable.studentId))
        .where(and(eq(courseEnrollmentsTable.classId, classId), isNull(courseEnrollmentsTable.withdrawnAt), eq(studentsTable.active, true)));
    return rows.map(row => row.student);
}
export async function studentInSection(studentId: number, classId: number) {
    const [row] = await db.select({ id: courseEnrollmentsTable.id }).from(courseEnrollmentsTable)
        .innerJoin(studentsTable, eq(studentsTable.id, courseEnrollmentsTable.studentId))
        .where(and(eq(courseEnrollmentsTable.classId, classId), eq(courseEnrollmentsTable.studentId, studentId), isNull(courseEnrollmentsTable.withdrawnAt), eq(studentsTable.active, true)));
    return !!row;
}
export async function studentSectionIds(user: SchoolUserRecord): Promise<number[]> {
    if (!user.studentId)
        return [];
    const rows = await db.select({ classId: courseEnrollmentsTable.classId }).from(courseEnrollmentsTable)
        .where(and(eq(courseEnrollmentsTable.studentId, user.studentId), isNull(courseEnrollmentsTable.withdrawnAt)));
    return rows.map(row => row.classId);
}
export async function assertStaffSection(tx: AcademicTx, userId: number, classId: number) {
    const [account] = await tx.select().from(schoolUsersTable).where(eq(schoolUsersTable.id, userId));
    if (!account?.active || !["admin", "teacher"].includes(account.role))
        fail(403, "Tài khoản không còn quyền thao tác.");
    if (account.role !== "admin") {
        const [assignment] = await tx.select().from(teacherClassAssignmentsTable).where(and(eq(teacherClassAssignmentsTable.schoolUserId, userId), eq(teacherClassAssignmentsTable.classId, classId)));
        if (!assignment)
            fail(403, "Lớp không còn được phân công cho bạn.");
    }
    return account;
}
export async function lessonPayloads(tx: AcademicTx | typeof db = db) {
    const rows = await tx.select({ lesson: academicLessonsTable, classroom: classroomsTable,
        teacher: schoolUsersTable, room: academicCatalogTable, sessionId: attendanceSessionsTable.id })
        .from(academicLessonsTable)
        .innerJoin(classroomsTable, eq(classroomsTable.id, academicLessonsTable.classId))
        .innerJoin(schoolUsersTable, eq(schoolUsersTable.id, academicLessonsTable.teacherId))
        .innerJoin(academicCatalogTable, eq(academicCatalogTable.id, academicLessonsTable.roomId))
        .leftJoin(attendanceSessionsTable, eq(attendanceSessionsTable.lessonId, academicLessonsTable.id));
    return rows.map(({ lesson, classroom, teacher, room, sessionId }) => ({
        ...lesson, className: classroom.name, subject: classroom.subject, semesterId: classroom.semesterId,
        teacherName: teacher.displayName, roomName: room.name, sessionId,
    }));
}
export type LessonCandidate = {
    classId: number;
    teacherId: number;
    roomId: number;
    startsAt: Date;
    endsAt: Date;
};
export function overlaps(a: {
    startsAt: Date;
    endsAt: Date;
}, b: {
    startsAt: Date;
    endsAt: Date;
}) {
    return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
export async function assertNoConflicts(tx: AcademicTx, candidates: LessonCandidate[], excludeId?: number, replacement?: {
    classId: number;
    studentIds: number[];
}) {
    const existing = (await tx.select().from(academicLessonsTable)).filter(l => l.status === "scheduled" &&
        l.id !== excludeId && (!replacement || l.classId !== replacement.classId));
    const enrollments = await tx.select().from(courseEnrollmentsTable).where(isNull(courseEnrollmentsTable.withdrawnAt));
    const members = new Map<number, Set<number>>();
    for (const e of enrollments) {
        if (!members.has(e.classId))
            members.set(e.classId, new Set());
        members.get(e.classId)!.add(e.studentId);
    }
    if (replacement)
        members.set(replacement.classId, new Set(replacement.studentIds));
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        for (const other of [...existing, ...candidates.slice(0, i)]) {
            if (!overlaps(candidate, other))
                continue;
            const day = candidate.startsAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
            if (candidate.teacherId === other.teacherId)
                fail(409, `Trùng lịch giảng viên vào ${day}.`);
            if (candidate.roomId === other.roomId)
                fail(409, `Trùng phòng học vào ${day}.`);
            if (candidate.classId === other.classId)
                fail(409, `Trùng buổi của lớp học phần vào ${day}.`);
            const first = members.get(candidate.classId) ?? new Set<number>();
            const second = members.get(other.classId) ?? new Set<number>();
            if ([...first].some(id => second.has(id)))
                fail(409, `Sinh viên có lịch giao nhau vào ${day} giữa hai lớp học phần.`);
        }
    }
}
