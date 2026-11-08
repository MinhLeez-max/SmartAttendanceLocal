import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, academicCatalogTable, academicLessonsTable, classroomsTable, studentsTable, schoolUsersTable, teacherClassAssignmentsTable, courseEnrollmentsTable, attendanceSessionsTable, attendanceRecordsTable, attendanceAuditsTable } from "@workspace/db";
import { AcademicError, assertNoConflicts, calendarDate, lessonTimes, overlaps, reconcileScheduledSessions, seriesDates } from "./academic-domain";
import { openAttendance } from "./open-attendance";
import { submitQr } from "./qr-attendance";
import { loadPersonalAttendance } from "./personal-attendance";
import { recordedAttendanceStats } from "./attendance-statistics";
test("partially recorded legacy history never infers absence from membership or empty sessions", () => {
    const records = [
        { sessionId: 1, studentId: 10, status: "present" },
        { sessionId: 99, studentId: 20, status: "absent" },
    ];
    assert.deepEqual(recordedAttendanceStats(records, [1, 2]), { recordedCount: 1, attended: 1, absent: 0, rate: 100 });
    assert.deepEqual(recordedAttendanceStats(records, [1, 2], 20), { recordedCount: 0, attended: 0, absent: 0, rate: null });
    const snapshots = [...records, { sessionId: 3, studentId: 10, status: "late" }, { sessionId: 3, studentId: 20, status: "absent" }];
    assert.deepEqual(recordedAttendanceStats(snapshots, [1, 2, 3]), { recordedCount: 3, attended: 2, absent: 1, rate: 66.7 });
    assert.deepEqual(recordedAttendanceStats(snapshots, [1, 2, 3], 20), { recordedCount: 1, attended: 0, absent: 1, rate: 0 });
});
test("calendar dates and Vietnam local lesson boundaries", () => {
    assert.equal(calendarDate("2028-02-29"), "2028-02-29");
    assert.throws(() => calendarDate("2027-02-29"));
    assert.throws(() => lessonTimes("2026-11-08", "10:00", "09:00"));
    assert.equal(lessonTimes("2026-11-08", "07:00", "09:00").startsAt.toISOString(), "2026-11-08T00:00:00.000Z");
    assert.deepEqual(seriesDates("2026-11-02", "2026-11-16", 1), ["2026-11-02", "2026-11-09", "2026-11-16"]);
    assert.throws(() => seriesDates("2026-11-02", "2026-11-03", null));
    assert.throws(() => seriesDates("2026-01-01", "2028-01-01", 1));
    const first = lessonTimes("2026-11-08", "07:00", "09:00");
    assert.equal(overlaps(first, lessonTimes("2026-11-08", "09:00", "10:00")), false);
    assert.equal(overlaps(first, lessonTimes("2026-11-08", "08:59", "10:00")), true);
});
test("database integration: multi-course membership, conflicts, roster snapshot, QR and revoked access", async () => {
    const suffix = `TEST_${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const fixture = await db.transaction(async (tx) => {
        const catalog = await tx.insert(academicCatalogTable).output().values([
            { kind: "subjects", code: suffix + "_M", name: suffix + " Subject" },
            { kind: "semesters", code: suffix + "_HK", name: suffix + " Semester", startDate: "2020-01-01", endDate: "2035-12-31" },
            { kind: "rooms", code: suffix + "_R1", name: suffix + " Room1", latitude: 10, longitude: 106 },
            { kind: "rooms", code: suffix + "_R2", name: suffix + " Room2", latitude: 10, longitude: 106 },
        ]);
        const classes = await tx.insert(classroomsTable).output().values([1, 2].map(i => ({
            code: suffix + "_C" + i, name: suffix + " Class" + i, subject: catalog[0]!.name, room: catalog[2]!.name,
            subjectId: catalog[0]!.id, semesterId: catalog[1]!.id, roomId: catalog[i + 1]!.id,
        })));
        const students = await tx.insert(studentsTable).output().values([1, 2, 3].map(i => ({ fullName: suffix + " Student" + i, studentCode: suffix + "_S" + i })));
        const teachers = await tx.insert(schoolUsersTable).output().values([1, 2].map(i => ({
            clerkUserId: suffix + "_teacher" + i, email: `${suffix}_t${i}@example.invalid`, displayName: suffix + " Teacher" + i, role: "teacher",
        })));
        const users = await tx.insert(schoolUsersTable).output().values(students.map((s, i) => ({
            clerkUserId: suffix + "_student" + i, email: `${suffix}_s${i}@example.invalid`, displayName: s.fullName, role: "student", studentId: s.id,
        })));
        await tx.insert(teacherClassAssignmentsTable).values(classes.map((c, i) => ({ classId: c.id, schoolUserId: teachers[i]!.id })));
        await tx.insert(courseEnrollmentsTable).values([
            { classId: classes[0]!.id, studentId: students[0]!.id },
            { classId: classes[0]!.id, studentId: students[1]!.id },
            { classId: classes[1]!.id, studentId: students[0]!.id },
            { classId: classes[1]!.id, studentId: students[2]!.id },
        ]);
        const [lesson] = await tx.insert(academicLessonsTable).output().values({
            classId: classes[0]!.id, teacherId: teachers[0]!.id, roomId: catalog[2]!.id,
            startsAt: new Date(now - 5 * 60000), endsAt: new Date(now + 60 * 60000),
        });
        return { catalog, classes, students, teachers, users, lesson: lesson! };
    });
    const { catalog, classes, students, teachers, users, lesson } = fixture;
    const fails = (status: number) => (e: unknown) => e instanceof AcademicError && e.status === status;
    try {
        await assert.rejects(db.transaction(tx => assertNoConflicts(tx, [{
                classId: classes[1]!.id, teacherId: teachers[1]!.id, roomId: catalog[3]!.id,
                startsAt: lesson.startsAt, endsAt: lesson.endsAt,
            }])), fails(409));
        await assert.rejects(openAttendance(teachers[1]!, classes[0]!.id, lesson.id), fails(403));
        const sessionId = await openAttendance(teachers[0]!, classes[0]!.id, lesson.id);
        assert.equal(await openAttendance(teachers[0]!, classes[0]!.id, lesson.id), sessionId);
        const [session] = await db.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, sessionId));
        const roster = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.sessionId, sessionId));
        assert.equal(roster.length, 2);
        assert.ok(roster.every(r => r.status === "absent"));
        await db.update(academicCatalogTable).set({ latitude: 20 }).where(eq(academicCatalogTable.id, catalog[2]!.id));
        const location = { latitude: 10, longitude: 106, accuracyMeters: 5 };
        await assert.rejects(submitQr(users[2]!, session!.qrToken, location), fails(403));
        await assert.rejects(submitQr(users[1]!, session!.qrToken, { ...location, accuracyMeters: 101 }), fails(422));
        await assert.rejects(submitQr(users[1]!, session!.qrToken, { ...location, latitude: 10.01 }), fails(403));
        const scans = await Promise.all([submitQr(users[0]!, session!.qrToken, location), submitQr(users[0]!, session!.qrToken, location)]);
        assert.equal(scans.filter(r => !r.duplicate).length, 1);
        assert.equal(scans.filter(r => r.duplicate).length, 1);
        assert.equal(scans[0]!.record.status, "present");
        await db.update(academicLessonsTable).set({ startsAt: new Date(now - 20 * 60000) }).where(eq(academicLessonsTable.id, lesson.id));
        const late = await submitQr(users[1]!, session!.qrToken, location);
        assert.equal(late.record.status, "late");
        await db.update(schoolUsersTable).set({ active: false }).where(eq(schoolUsersTable.id, users[1]!.id));
        await assert.rejects(submitQr(users[1]!, session!.qrToken, location), fails(403));
        await db.update(courseEnrollmentsTable).set({ withdrawnAt: new Date() }).where(eq(courseEnrollmentsTable.studentId, students[0]!.id));
        await assert.rejects(submitQr(users[0]!, session!.qrToken, location), fails(403));
        await db.update(schoolUsersTable).set({ active: true }).where(eq(schoolUsersTable.id, users[1]!.id));
        await db.update(attendanceSessionsTable).set({ status: "closed" }).where(eq(attendanceSessionsTable.id, sessionId));
        await assert.rejects(submitQr(users[1]!, session!.qrToken, location), fails(404));
        await db.update(attendanceSessionsTable).set({ status: "active", qrExpiresAt: new Date(now - 1000) }).where(eq(attendanceSessionsTable.id, sessionId));
        await assert.rejects(submitQr(users[1]!, session!.qrToken, location), fails(404));
        assert.equal((await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.sessionId, sessionId))).length, 2);
        // No staff session-page request: next lesson must close the overdue session atomically.
        const ended = new Date(now - 1000);
        await db.update(academicLessonsTable).set({ endsAt: ended }).where(eq(academicLessonsTable.id, lesson.id));
        const [nextLesson] = await db.insert(academicLessonsTable).output().values({
            classId: classes[0]!.id, teacherId: teachers[0]!.id, roomId: catalog[2]!.id,
            startsAt: new Date(now - 1000), endsAt: new Date(now + 3600000),
        });
        const nextId = await openAttendance(teachers[0]!, classes[0]!.id, nextLesson!.id);
        assert.notEqual(nextId, sessionId);
        const [expired] = await db.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, sessionId));
        assert.equal(expired!.status, "closed");
        assert.equal(expired!.endedAt!.getTime(), ended.getTime());
        const history = await loadPersonalAttendance(students[1]!.id, { classId: classes[0]!.id });
        assert.equal(history.rows.length, 1);
        assert.equal(history.late, 1);
        // The shared authenticated-read reconciliation also closes unattended lessons
        // when nobody opens a next session or views a staff session page.
        await db.update(academicLessonsTable).set({ endsAt: new Date(Date.now() - 500) }).where(eq(academicLessonsTable.id, nextLesson!.id));
        await reconcileScheduledSessions();
        const [closedNext] = await db.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.id, nextId));
        assert.equal(closedNext!.status, "closed");
        const updatedHistory = await loadPersonalAttendance(students[1]!.id, { classId: classes[0]!.id });
        assert.equal(updatedHistory.rows.length, 2);
        assert.equal(updatedHistory.absent, 1);
        // Reproduce migrated partial history: two legacy class members but only
        // one actual check-in. The other student's missing row is not an absence.
        await db.update(studentsTable).set({ classId: classes[0]!.id }).where(inArray(studentsTable.id, [students[0]!.id, students[1]!.id]));
        const [legacy] = await db.insert(attendanceSessionsTable).output().values({
            classId: classes[0]!.id, rosterCaptured: false, status: "closed",
            startedAt: new Date(now - 86400000), endedAt: new Date(now - 86000000),
            qrToken: randomUUID(), qrExpiresAt: new Date(now - 86000000),
        });
        await db.insert(attendanceRecordsTable).values({ sessionId: legacy!.id, studentId: students[0]!.id, status: "present" });
        const closed = (await db.select().from(attendanceSessionsTable).where(eq(attendanceSessionsTable.classId, classes[0]!.id))).filter(s => s.status === "closed");
        const closedIds = closed.map(s => s.id);
        const actual = await db.select().from(attendanceRecordsTable).where(inArray(attendanceRecordsTable.sessionId, closedIds));
        assert.equal(recordedAttendanceStats(actual, [legacy!.id]).rate, 100);
        assert.equal(recordedAttendanceStats(actual, [legacy!.id], students[1]!.id).rate, null);
        assert.deepEqual(recordedAttendanceStats(actual, closedIds), { recordedCount: 4, attended: 3, absent: 1, rate: 75 });
        assert.deepEqual(recordedAttendanceStats(actual, closedIds, students[1]!.id), { recordedCount: 2, attended: 1, absent: 1, rate: 50 });
        const partialHistory = await loadPersonalAttendance(students[1]!.id, { classId: classes[0]!.id });
        assert.equal(partialHistory.rows.length, 2);
        assert.equal(partialHistory.absent, 1);
    }
    finally {
        // Delete only this test's own rows, never user data.
        await db.transaction(async (tx) => {
            const classIds = classes.map(c => c.id);
            const sessions = await tx.select().from(attendanceSessionsTable).where(inArray(attendanceSessionsTable.classId, classIds));
            const sessionIds = sessions.map(s => s.id);
            if (sessionIds.length) {
                const records = await tx.select().from(attendanceRecordsTable).where(inArray(attendanceRecordsTable.sessionId, sessionIds));
                if (records.length)
                    await tx.delete(attendanceAuditsTable).where(inArray(attendanceAuditsTable.recordId, records.map(r => r.id)));
                await tx.delete(attendanceRecordsTable).where(inArray(attendanceRecordsTable.sessionId, sessionIds));
                await tx.delete(attendanceSessionsTable).where(inArray(attendanceSessionsTable.id, sessionIds));
            }
            await tx.delete(academicLessonsTable).where(inArray(academicLessonsTable.classId, classIds));
            await tx.delete(teacherClassAssignmentsTable).where(inArray(teacherClassAssignmentsTable.classId, classIds));
            await tx.delete(courseEnrollmentsTable).where(inArray(courseEnrollmentsTable.classId, classIds));
            await tx.delete(schoolUsersTable).where(inArray(schoolUsersTable.id, [...teachers, ...users].map(u => u.id)));
            await tx.delete(studentsTable).where(inArray(studentsTable.id, students.map(s => s.id)));
            await tx.delete(classroomsTable).where(inArray(classroomsTable.id, classIds));
            await tx.delete(academicCatalogTable).where(inArray(academicCatalogTable.id, catalog.map(c => c.id)));
        });
        await pool.end();
    }
});
