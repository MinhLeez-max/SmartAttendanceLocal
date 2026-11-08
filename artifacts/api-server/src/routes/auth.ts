import { upsertReturning as _upsertReturning } from "@workspace/db";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { CreateSchoolInvitationBody, CreateSchoolInvitationResponse, GetSchoolBootstrapStatusResponse, GetCurrentSchoolUserResponse, ListSchoolUsersResponse, ListSchoolInvitationsResponse, RevokeSchoolInvitationParams, RevokeSchoolInvitationResponse, UpdateSchoolUserBody, UpdateSchoolUserParams, UpdateSchoolUserResponse, } from "@workspace/api-zod";
import { clerkClient } from "@clerk/express";
import { classroomsTable, db, schoolInvitationsTable, schoolUsersTable, studentsTable, teacherClassAssignmentsTable, academicCatalogTable, academicLessonsTable, } from "@workspace/db";
import { currentSchoolUser, requireRole, type SchoolUserRecord, } from "../middlewares/schoolAuth";
import { invitationSignUpUrl } from "../lib/invitation-url";
import { academicAction, fail } from "../lib/academic-domain";
const router: IRouter = Router();
export const publicAuthRouter: IRouter = Router();
const normalizeEmail = (email: string) => email.trim().toLowerCase();
function schoolInvitationPayload(invitation: typeof schoolInvitationsTable.$inferSelect) {
    return {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        createdAt: invitation.createdAt,
    };
}
publicAuthRouter.get("/auth/bootstrap-status", async (_req, res): Promise<void> => {
    const bootstrapEmail = normalizeEmail(process.env.SCHOOL_BOOTSTRAP_ADMIN_EMAIL ?? "");
    const [designatedAdmin] = bootstrapEmail
        ? await db
            .select({ id: schoolUsersTable.id }).top(1).from(schoolUsersTable)
            .where(and(eq(schoolUsersTable.role, "admin"), sql `lower(${schoolUsersTable.email}) = ${bootstrapEmail}`))
        : [];
    res.json(GetSchoolBootstrapStatusResponse.parse({
        available: !!bootstrapEmail && !designatedAdmin,
    }));
});
async function schoolUserPayload(user: SchoolUserRecord) {
    const [student] = user.studentId
        ? await db
            .select().top(1).from(studentsTable)
            .where(eq(studentsTable.id, user.studentId))
        : [];
    const assignments = await db
        .select({ classId: teacherClassAssignmentsTable.classId })
        .from(teacherClassAssignmentsTable)
        .where(eq(teacherClassAssignmentsTable.schoolUserId, user.id));
    const [cohort] = student?.cohortId ? await db.select().from(academicCatalogTable).where(eq(academicCatalogTable.id, student.cohortId)) : [];
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        phone: user.phone,
        faculty: user.faculty,
        major: user.major,
        staffCode: user.staffCode,
        active: user.active,
        cohortId: student?.cohortId ?? null,
        cohortName: cohort?.name ?? null,
        role: user.role,
        studentId: user.studentId,
        studentCode: student?.studentCode ?? null,
        studentName: student?.fullName ?? null,
        classIds: assignments.map((assignment) => assignment.classId),
        createdAt: user.createdAt,
    };
}
router.get("/auth/me", async (_req, res): Promise<void> => {
    res.json(GetCurrentSchoolUserResponse.parse(await schoolUserPayload(currentSchoolUser(res))));
});
router.get("/admin/users", requireRole("admin"), async (_req, res): Promise<void> => {
    const users = await db
        .select()
        .from(schoolUsersTable)
        .orderBy(desc(schoolUsersTable.createdAt));
    const payload = await Promise.all(users.map(schoolUserPayload));
    res.json(ListSchoolUsersResponse.parse(payload));
});
router.get("/admin/invitations", requireRole("admin"), async (_req, res): Promise<void> => {
    const invitations = await db
        .select()
        .from(schoolInvitationsTable)
        .orderBy(desc(schoolInvitationsTable.createdAt));
    res.json(ListSchoolInvitationsResponse.parse(invitations.map(schoolInvitationPayload)));
});
router.post("/admin/invitations", requireRole("admin"), async (req, res): Promise<void> => {
    const input = CreateSchoolInvitationBody.safeParse(req.body);
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    const email = normalizeEmail(input.data.email);
    let redirectUrl: string;
    try {
        redirectUrl = invitationSignUpUrl(req.headers);
    }
    catch {
        res.status(400).json({
            error: "Không xác định được địa chỉ ứng dụng để gửi lời mời. Hãy mở ứng dụng đúng tên miền và thử lại.",
        });
        return;
    }
    const [existingUser] = await db
        .select({ id: schoolUsersTable.id }).top(1).from(schoolUsersTable)
        .where(sql `lower(${schoolUsersTable.email}) = ${email}`);
    if (existingUser) {
        res.status(409).json({
            error: "Email này đã có tài khoản trong trường.",
        });
        return;
    }
    const [existingInvitation] = await db
        .select().top(1).from(schoolInvitationsTable)
        .where(eq(schoolInvitationsTable.email, email));
    if (existingInvitation?.status === "accepted") {
        res.status(409).json({
            error: "Lời mời này đã được sử dụng.",
        });
        return;
    }
    const invitationExpired = existingInvitation?.status === "pending" &&
        existingInvitation.createdAt.getTime() <
            Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (existingInvitation?.status === "pending" && !invitationExpired) {
        res.status(409).json({
            error: "Email này đã có lời mời đang chờ.",
        });
        return;
    }
    if (invitationExpired && existingInvitation) {
        await db
            .update(schoolInvitationsTable)
            .set({ status: "expired" })
            .where(eq(schoolInvitationsTable.id, existingInvitation.id));
    }
    let clerkInvitationId: string | undefined;
    try {
        const createdInvitation = await clerkClient.invitations.createInvitation({
            emailAddress: email,
            redirectUrl,
            notify: true,
            expiresInDays: 30,
        });
        clerkInvitationId = createdInvitation.id;
        const [saved] = await _upsertReturning(db, schoolInvitationsTable, {
            email,
            clerkInvitationId,
            status: "pending",
            createdBySchoolUserId: currentSchoolUser(res).id,
        }, {
            target: schoolInvitationsTable.email,
            set: {
                clerkInvitationId,
                status: "pending",
                createdBySchoolUserId: currentSchoolUser(res).id,
                createdAt: new Date(),
                acceptedAt: null,
                acceptedUserId: null,
            },
        });
        res.status(201).json(CreateSchoolInvitationResponse.parse(schoolInvitationPayload(saved)));
    }
    catch (error) {
        if (clerkInvitationId) {
            try {
                await clerkClient.invitations.revokeInvitation(clerkInvitationId);
            }
            catch {
                // Keep the invitation failure response generic; the database remains authoritative.
            }
        }
        req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unable to create school invitation");
        res.status(502).json({
            error: "Không thể gửi lời mời. Hãy kiểm tra cấu hình email Clerk.",
        });
    }
});
router.delete("/admin/invitations/:invitationId", requireRole("admin"), async (req, res): Promise<void> => {
    const params = RevokeSchoolInvitationParams.safeParse(req.params);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    const [invitation] = await db
        .select().top(1).from(schoolInvitationsTable)
        .where(eq(schoolInvitationsTable.id, params.data.invitationId));
    if (!invitation) {
        res.status(404).json({ error: "Không tìm thấy lời mời." });
        return;
    }
    if (invitation.status !== "pending") {
        res.status(409).json({ error: "Chỉ có thể hủy lời mời đang chờ." });
        return;
    }
    try {
        await clerkClient.invitations.revokeInvitation(invitation.clerkInvitationId);
    }
    catch (error) {
        req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unable to revoke school invitation");
        res.status(502).json({
            error: "Không thể hủy lời mời trong hệ thống xác thực.",
        });
        return;
    }
    const [revoked] = await db
        .update(schoolInvitationsTable)
        .set({ status: "revoked" }).output().where(eq(schoolInvitationsTable.id, invitation.id));
    res.json(RevokeSchoolInvitationResponse.parse(schoolInvitationPayload(revoked)));
});
router.patch("/admin/users/:userId", requireRole("admin"), academicAction(async (req, res): Promise<void> => {
    const params = UpdateSchoolUserParams.safeParse(req.params);
    const input = UpdateSchoolUserBody.safeParse(req.body);
    if (!params.success) {
        res.status(400).json({ error: params.error.message });
        return;
    }
    if (!input.success) {
        res.status(400).json({ error: input.error.message });
        return;
    }
    const [target] = await db
        .select().top(1).from(schoolUsersTable)
        .where(eq(schoolUsersTable.id, params.data.userId));
    if (!target) {
        res.status(404).json({ error: "Không tìm thấy tài khoản." });
        return;
    }
    const classIds = [...new Set(input.data.classIds)];
    if (classIds.length !== input.data.classIds.length) {
        res.status(400).json({ error: "Danh sách lớp bị trùng." });
        return;
    }
    if (input.data.role === "student" && input.data.studentId === null) {
        res.status(400).json({ error: "Hãy liên kết hồ sơ học sinh trước." });
        return;
    }
    if (input.data.role !== "student" && input.data.studentId !== null) {
        res.status(400).json({
            error: "Chỉ tài khoản học sinh mới được liên kết hồ sơ học sinh.",
        });
        return;
    }
    if (input.data.role !== "teacher" && classIds.length > 0) {
        res.status(400).json({
            error: "Chỉ tài khoản giáo viên mới được phân công lớp.",
        });
        return;
    }
    if (input.data.role === "student" && input.data.studentId !== null) {
        const [student] = await db
            .select({ id: studentsTable.id }).top(1).from(studentsTable)
            .where(eq(studentsTable.id, input.data.studentId));
        if (!student) {
            res.status(404).json({ error: "Không tìm thấy hồ sơ học sinh." });
            return;
        }
        const [otherAccount] = await db
            .select({ id: schoolUsersTable.id }).top(1).from(schoolUsersTable)
            .where(and(eq(schoolUsersTable.studentId, input.data.studentId), ne(schoolUsersTable.id, target.id)));
        if (otherAccount) {
            res.status(409).json({
                error: "Hồ sơ học sinh đã được liên kết với tài khoản khác.",
            });
            return;
        }
    }
    if (classIds.length > 0) {
        const existingClasses = await db
            .select({ id: classroomsTable.id })
            .from(classroomsTable)
            .where(inArray(classroomsTable.id, classIds));
        if (existingClasses.length !== classIds.length) {
            res.status(404).json({ error: "Một hoặc nhiều lớp không tồn tại." });
            return;
        }
    }
    const updated = await db.transaction(async (tx) => {
        await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231582', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
        const [fresh] = await tx.select().from(schoolUsersTable).where(eq(schoolUsersTable.id, target.id));
        if (fresh!.role === "admin" && fresh!.active && (input.data.role !== "admin" || input.data.active === false)) {
            const [admins] = await tx.select({ value: count() }).from(schoolUsersTable)
                .where(and(eq(schoolUsersTable.role, "admin"), eq(schoolUsersTable.active, true)));
            if (Number(admins?.value ?? 0) <= 1)
                fail(409, "Không thể hạ quyền hoặc vô hiệu hóa quản trị viên hoạt động cuối cùng.");
        }
        const lessons = await tx.select().from(academicLessonsTable).where(eq(academicLessonsTable.teacherId, target.id));
        if (lessons.some(l => l.status === "scheduled" && l.endsAt > new Date() && (input.data.role !== "teacher" || !classIds.includes(l.classId)))) {
            fail(409, "Giảng viên còn lịch dạy ở lớp bị gỡ; hãy phân công lại buổi học trước.");
        }
        let displayName = input.data.displayName?.trim();
        if (input.data.displayName !== undefined && !displayName)
            fail(400, "Họ tên không được để trống.");
        if (input.data.studentId) {
            const [student] = await tx.select().from(studentsTable).where(eq(studentsTable.id, input.data.studentId));
            if (!student?.active)
                fail(400, "Hồ sơ sinh viên đã ngừng hoạt động.");
            displayName = displayName || student.fullName;
            if (input.data.studentCode !== undefined && !input.data.studentCode.trim())
                fail(400, "Mã sinh viên không được để trống.");
            await tx.update(studentsTable).set({ fullName: displayName,
                ...(input.data.studentCode !== undefined ? { studentCode: input.data.studentCode.trim().toUpperCase() } : {}),
            }).where(eq(studentsTable.id, student.id));
        }
        const [saved] = await tx
            .update(schoolUsersTable)
            .set({
            role: input.data.role,
            studentId: input.data.studentId,
            ...(displayName !== undefined ? { displayName } : {}),
            ...(input.data.phone !== undefined ? { phone: input.data.phone?.trim() || null } : {}),
            ...(input.data.faculty !== undefined ? { faculty: input.data.faculty?.trim() || null } : {}),
            ...(input.data.major !== undefined ? { major: input.data.major?.trim() || null } : {}),
            ...(input.data.staffCode !== undefined ? { staffCode: input.data.staffCode?.trim().toUpperCase() || null } : {}),
            ...(input.data.active !== undefined ? { active: input.data.active } : {}),
        }).output().where(eq(schoolUsersTable.id, target.id));
        await tx
            .delete(teacherClassAssignmentsTable)
            .where(eq(teacherClassAssignmentsTable.schoolUserId, target.id));
        if (input.data.role === "teacher" && classIds.length > 0) {
            await tx.insert(teacherClassAssignmentsTable).values(classIds.map((classId) => ({
                schoolUserId: target.id,
                classId,
            })));
        }
        return saved;
    });
    res.json(UpdateSchoolUserResponse.parse(await schoolUserPayload(updated)));
}));
export default router;
