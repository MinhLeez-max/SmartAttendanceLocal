type RecordedAttendance = {
    sessionId: number;
    studentId: number;
    status: string;
};
/** A missing legacy row means unknown, never an inferred absence. New roster
 * snapshots already contain explicit absent rows and need no membership fallback. */
export function recordedAttendanceStats(records: RecordedAttendance[], sessionIds: number[], studentId?: number) {
    const scope = new Set(sessionIds);
    const known = records.filter(r => scope.has(r.sessionId) && (studentId === undefined || r.studentId === studentId));
    const attended = known.filter(r => r.status === "present" || r.status === "late").length;
    return {
        recordedCount: known.length,
        attended,
        absent: known.filter(r => r.status === "absent").length,
        rate: known.length ? Math.round(attended / known.length * 1000) / 10 : null,
    };
}
