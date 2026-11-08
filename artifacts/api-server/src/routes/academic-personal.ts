import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import * as api from "@workspace/api-zod";
import { db, attendanceAuditsTable, attendanceRecordsTable, attendanceSessionsTable } from "@workspace/db";
import { currentSchoolUser, ensureClassAccess, requireRole } from "../middlewares/schoolAuth";
import { academicAction, fail } from "../lib/academic-domain";
import { loadPersonalAttendance } from "../lib/personal-attendance";
const router: IRouter = Router();
router.get("/academic/my-attendance", requireRole("student"), academicAction(async (req, res) => {
    const input = api.GetMyAcademicAttendanceQueryParams.parse(req.query);
    const user = currentSchoolUser(res);
    if (!user.studentId)
        fail(400, "Tài khoản chưa liên kết hồ sơ sinh viên.");
    res.json(api.GetMyAcademicAttendanceResponse.parse(await loadPersonalAttendance(user.studentId, input)));
}));
router.get("/attendance/:recordId/history", requireRole("admin", "teacher"), academicAction(async (req, res) => {
    const { recordId } = api.ListAttendanceHistoryParams.parse(req.params);
    const [joined] = await db.select({ classId: attendanceSessionsTable.classId }).from(attendanceRecordsTable)
        .innerJoin(attendanceSessionsTable, eq(attendanceRecordsTable.sessionId, attendanceSessionsTable.id))
        .where(eq(attendanceRecordsTable.id, recordId));
    if (!joined)
        fail(404, "Không tìm thấy bản ghi.");
    if (!(await ensureClassAccess(res, joined.classId)))
        return;
    res.json(api.ListAttendanceHistoryResponse.parse(await db.select().from(attendanceAuditsTable)
        .where(eq(attendanceAuditsTable.recordId, recordId)).orderBy(desc(attendanceAuditsTable.createdAt))));
}));
export default router;
