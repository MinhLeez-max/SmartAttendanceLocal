import { and, desc, eq } from "drizzle-orm";
import { db, academicLessonsTable, attendanceRecordsTable, attendanceSessionsTable, classroomsTable } from "@workspace/db";
export async function loadPersonalAttendance(studentId: number, filters: {
    classId?: number;
    subjectId?: number;
    semesterId?: number;
} = {}) {
    const rows = await db.select({
        record: attendanceRecordsTable, session: attendanceSessionsTable, section: classroomsTable,
        lesson: academicLessonsTable,
    }).from(attendanceRecordsTable)
        .innerJoin(attendanceSessionsTable, eq(attendanceRecordsTable.sessionId, attendanceSessionsTable.id))
        .innerJoin(classroomsTable, eq(classroomsTable.id, attendanceSessionsTable.classId))
        .leftJoin(academicLessonsTable, eq(academicLessonsTable.id, attendanceSessionsTable.lessonId))
        .where(and(eq(attendanceRecordsTable.studentId, studentId), eq(attendanceSessionsTable.status, "closed")))
        .orderBy(desc(attendanceSessionsTable.startedAt));
    const scoped = rows.filter(r => (!filters.classId || r.section.id === filters.classId) &&
        (!filters.subjectId || r.section.subjectId === filters.subjectId) && (!filters.semesterId || r.section.semesterId === filters.semesterId));
    return {
        present: scoped.filter(r => r.record.status === "present").length,
        late: scoped.filter(r => r.record.status === "late").length,
        absent: scoped.filter(r => r.record.status === "absent").length,
        rows: scoped.map(({ record, session, section, lesson }) => ({
            id: record.id, classId: section.id, className: section.name, subject: section.subject,
            semesterId: section.semesterId, date: lesson?.startsAt ?? session.startedAt, status: record.status, note: record.note,
        })),
    };
}
