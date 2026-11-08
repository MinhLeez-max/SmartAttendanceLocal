import { clerkClient, getAuth } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import type { RequestHandler, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, schoolInvitationsTable, schoolUsersTable, teacherClassAssignmentsTable, studentsTable, } from "@workspace/db";
export type SchoolUserRecord = typeof schoolUsersTable.$inferSelect;
export type SchoolRole = "admin" | "teacher" | "student" | "pending";
export function currentSchoolUser(res: Response): SchoolUserRecord {
    return res.locals.schoolUser as SchoolUserRecord;
}
const normalizeEmail = (value: string) => value.trim().toLowerCase();
async function verifiedClerkIdentity(userId: string) {
    const clerkUser = await clerkClient.users.getUser(userId);
    const primaryEmail = clerkUser.emailAddresses.find((address) => address.id === clerkUser.primaryEmailAddressId);
    const email = normalizeEmail(primaryEmail?.emailAddress ?? "");
    if (!email || primaryEmail?.verification?.status !== "verified") {
        return null;
    }
    return {
        email,
        displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
            "Tài khoản trường học",
    };
}
export const requireSchoolUser: RequestHandler = async (req, res, next) => {
    const auth = getAuth(req);
    if (!auth.userId) {
        res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
        return;
    }
    try {
        let [schoolUser] = await db
            .select().top(1).from(schoolUsersTable)
            .where(eq(schoolUsersTable.clerkUserId, auth.userId));
        const bootstrapEmail = normalizeEmail(process.env.SCHOOL_BOOTSTRAP_ADMIN_EMAIL ?? "");
        if (schoolUser) {
            if (!schoolUser.active) {
                res.status(403).json({ error: "Tài khoản đã bị vô hiệu hóa. Hãy liên hệ quản trị viên." });
                return;
            }
            if (bootstrapEmail &&
                normalizeEmail(schoolUser.email) === bootstrapEmail &&
                schoolUser.role !== "admin") {
                const identity = await verifiedClerkIdentity(auth.userId);
                if (identity?.email === bootstrapEmail) {
                    schoolUser = await db.transaction(async (tx) => {
                        const [saved] = await tx
                            .update(schoolUsersTable)
                            .set({ role: "admin", studentId: null }).output().where(eq(schoolUsersTable.id, schoolUser!.id));
                        await tx
                            .delete(teacherClassAssignmentsTable)
                            .where(eq(teacherClassAssignmentsTable.schoolUserId, schoolUser!.id));
                        await tx
                            .update(schoolInvitationsTable)
                            .set({
                            status: "accepted",
                            acceptedAt: new Date(),
                            acceptedUserId: auth.userId!,
                        })
                            .where(and(eq(schoolInvitationsTable.email, bootstrapEmail), eq(schoolInvitationsTable.status, "pending")));
                        return saved;
                    });
                }
                else {
                    res.status(403).json({
                        error: "Email quản trị viên cần được xác minh trước khi cấp quyền.",
                    });
                    return;
                }
            }
        }
        else {
            const identity = await verifiedClerkIdentity(auth.userId);
            if (!identity) {
                res.status(403).json({
                    error: "Hãy xác minh email tài khoản trước khi vào không gian trường.",
                });
                return;
            }
            const { email, displayName } = identity;
            const provisioned = await db.transaction(async (tx) => {
                // Serialize bootstrap and invitation claims to prevent double creation.
                await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:78231581', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Attendance transaction lock timed out', 1;`);
                const [existing] = await tx
                    .select().top(1).from(schoolUsersTable)
                    .where(eq(schoolUsersTable.clerkUserId, auth.userId!));
                if (existing) {
                    return {
                        user: existing,
                        denied: null as null | "email_claimed" | "invite",
                    };
                }
                const [matchedEmailOwner] = await tx
                    .select().top(1).from(schoolUsersTable)
                    .where(sql `lower(${schoolUsersTable.email}) = ${email}`);
                if (matchedEmailOwner &&
                    matchedEmailOwner.clerkUserId !== auth.userId) {
                    return { user: null, denied: "email_claimed" as const };
                }
                if (bootstrapEmail && email === bootstrapEmail) {
                    const [created] = await tx
                        .insert(schoolUsersTable).output().values({
                        clerkUserId: auth.userId!,
                        email,
                        displayName,
                        role: "admin",
                    });
                    await tx
                        .update(schoolInvitationsTable)
                        .set({
                        status: "accepted",
                        acceptedAt: new Date(),
                        acceptedUserId: auth.userId!,
                    })
                        .where(and(eq(schoolInvitationsTable.email, email), eq(schoolInvitationsTable.status, "pending")));
                    return { user: created, denied: null };
                }
                const [invitation] = await tx
                    .select().top(1).from(schoolInvitationsTable)
                    .where(and(eq(schoolInvitationsTable.email, email), eq(schoolInvitationsTable.status, "pending")));
                if (!invitation) {
                    return { user: null, denied: "invite" as const };
                }
                const [created] = await tx
                    .insert(schoolUsersTable).output().values({
                    clerkUserId: auth.userId!,
                    email,
                    displayName,
                    role: "pending",
                });
                await tx
                    .update(schoolInvitationsTable)
                    .set({
                    status: "accepted",
                    acceptedAt: new Date(),
                    acceptedUserId: auth.userId!,
                })
                    .where(eq(schoolInvitationsTable.id, invitation.id));
                return { user: created, denied: null };
            });
            if (!provisioned.user) {
                res.status(403).json({
                    error: provisioned.denied === "email_claimed"
                        ? "Email này đã được liên kết với một tài khoản trường khác."
                        : "Tài khoản chưa được trường mời. Hãy liên hệ quản trị viên.",
                });
                return;
            }
            schoolUser = provisioned.user;
        }
        if (!schoolUser.active) {
            res.status(403).json({ error: "Tài khoản đã bị vô hiệu hóa." });
            return;
        }
        if (schoolUser.role === "student" && schoolUser.studentId) {
            const [student] = await db.select({ active: studentsTable.active }).from(studentsTable).where(eq(studentsTable.id, schoolUser.studentId));
            if (!student?.active) {
                res.status(403).json({ error: "Hồ sơ sinh viên đã ngừng hoạt động." });
                return;
            }
        }
        res.locals.schoolUser = schoolUser;
        next();
    }
    catch (error) {
        req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Unable to initialize school account");
        res.status(500).json({ error: "Không thể khởi tạo tài khoản trường học." });
    }
};
export function requireRole(...allowedRoles: SchoolRole[]): RequestHandler {
    return (_req, res, next) => {
        const user = res.locals.schoolUser as SchoolUserRecord | undefined;
        if (!user) {
            res.status(401).json({ error: "Vui lòng đăng nhập để tiếp tục." });
            return;
        }
        if (!allowedRoles.includes(user.role as SchoolRole)) {
            res.status(403).json({ error: "Tài khoản chưa được cấp quyền này." });
            return;
        }
        next();
    };
}
export async function accessibleClassIds(user: SchoolUserRecord): Promise<number[] | null> {
    if (user.role === "admin") {
        return null;
    }
    if (user.role !== "teacher") {
        return [];
    }
    const assignments = await db
        .select({ classId: teacherClassAssignmentsTable.classId })
        .from(teacherClassAssignmentsTable)
        .where(eq(teacherClassAssignmentsTable.schoolUserId, user.id));
    return assignments.map((assignment) => assignment.classId);
}
export async function ensureClassAccess(res: Response, classId: number): Promise<boolean> {
    const user = currentSchoolUser(res);
    if (user.role === "admin") {
        return true;
    }
    if (user.role !== "teacher") {
        res.status(403).json({ error: "Tài khoản chưa được cấp quyền này." });
        return false;
    }
    const [assignment] = await db
        .select({ id: teacherClassAssignmentsTable.id }).top(1).from(teacherClassAssignmentsTable)
        .where(and(eq(teacherClassAssignmentsTable.schoolUserId, user.id), eq(teacherClassAssignmentsTable.classId, classId)));
    if (!assignment) {
        res.status(403).json({ error: "Lớp này chưa được phân công cho bạn." });
        return false;
    }
    return true;
}
