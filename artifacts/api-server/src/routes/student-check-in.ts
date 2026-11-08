import { Router, type IRouter } from "express";
import { CreateQrStudentCheckInBody, CreateQrStudentCheckInParams, CreateQrStudentCheckInResponse, GetQrCheckInSessionParams, GetQrCheckInSessionResponse, } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { currentSchoolUser, requireRole } from "../middlewares/schoolAuth";
import { academicAction } from "../lib/academic-domain";
import { activeQr, submitQr } from "../lib/qr-attendance";
const router: IRouter = Router();
router.use("/qr", requireRole("student"));
router.get("/qr/:token", academicAction(async (req, res) => {
    const { token } = GetQrCheckInSessionParams.parse(req.params);
    const joined = await activeQr(db, token, currentSchoolUser(res).studentId);
    res.json(GetQrCheckInSessionResponse.parse({
        sessionId: joined.session.id, className: joined.classroom.name, subject: joined.classroom.subject,
        qrExpiresAt: joined.session.qrExpiresAt, checkInRadiusMeters: joined.session.checkInRadiusMeters,
    }));
}));
router.post("/qr/:token/check-in", academicAction(async (req, res) => {
    const { token } = CreateQrStudentCheckInParams.parse(req.params);
    const location = CreateQrStudentCheckInBody.parse(req.body);
    const result = await submitQr(currentSchoolUser(res), token, location);
    res.status(result.duplicate ? 409 : 201).json(CreateQrStudentCheckInResponse.parse({
        ...result.record, studentName: result.student.fullName, studentCode: result.student.studentCode,
    }));
}));
export default router;
