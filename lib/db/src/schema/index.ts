import { mssqlTable, int, bit, float, date, datetimeoffset, nvarchar } from "drizzle-orm/mssql-core";
import { sql } from "drizzle-orm";
export const academicCatalogTable = mssqlTable("academic_catalog", {
  id: int("id").identity().primaryKey().notNull(),
  kind: nvarchar("kind", { length: 200 }).notNull(),
  code: nvarchar("code", { length: 200 }).notNull(),
  name: nvarchar("name", { length: "max" }).notNull(),
  active: bit("active").notNull().default(true),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  faculty: nvarchar("faculty", { length: "max" }),
  major: nvarchar("major", { length: "max" }),
  latitude: float("latitude", { precision: 53 }),
  longitude: float("longitude", { precision: 53 }),
  checkInRadiusMeters: int("check_in_radius_meters").notNull().default(50),
});

export const academicLessonsTable = mssqlTable("academic_lessons", {
  id: int("id").identity().primaryKey().notNull(),
  classId: int("class_id").notNull(),
  teacherId: int("teacher_id").notNull(),
  roomId: int("room_id").notNull(),
  startsAt: datetimeoffset("starts_at", { mode: "date", precision: 3 }).notNull(),
  endsAt: datetimeoffset("ends_at", { mode: "date", precision: 3 }).notNull(),
  status: nvarchar("status", { length: "max" }).notNull().default("scheduled"),
  reason: nvarchar("reason", { length: "max" }),
});

export const attendanceAuditsTable = mssqlTable("attendance_audits", {
  id: int("id").identity().primaryKey().notNull(),
  recordId: int("record_id").notNull(),
  actorId: int("actor_id").notNull(),
  actorName: nvarchar("actor_name", { length: "max" }).notNull(),
  beforeStatus: nvarchar("before_status", { length: "max" }).notNull(),
  afterStatus: nvarchar("after_status", { length: "max" }).notNull(),
  reason: nvarchar("reason", { length: "max" }).notNull(),
  createdAt: datetimeoffset("created_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
});

export const attendanceRecordsTable = mssqlTable("attendance_records", {
  id: int("id").identity().primaryKey().notNull(),
  sessionId: int("session_id").notNull(),
  studentId: int("student_id").notNull(),
  status: nvarchar("status", { length: "max" }).notNull().default("present"),
  checkedInAt: datetimeoffset("checked_in_at", { mode: "date", precision: 3 }),
  note: nvarchar("note", { length: "max" }),
  updatedAt: datetimeoffset("updated_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
});

export const attendanceSessionsTable = mssqlTable("attendance_sessions", {
  id: int("id").identity().primaryKey().notNull(),
  lessonId: int("lesson_id"),
  rosterCaptured: bit("roster_captured").notNull().default(false),
  latitude: float("latitude", { precision: 53 }),
  longitude: float("longitude", { precision: 53 }),
  checkInRadiusMeters: int("check_in_radius_meters").notNull().default(50),
  classId: int("class_id").notNull(),
  status: nvarchar("status", { length: "max" }).notNull().default("active"),
  startedAt: datetimeoffset("started_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
  endedAt: datetimeoffset("ended_at", { mode: "date", precision: 3 }),
  qrToken: nvarchar("qr_token", { length: 200 }).notNull(),
  qrExpiresAt: datetimeoffset("qr_expires_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
});

export const classroomsTable = mssqlTable("classrooms", {
  id: int("id").identity().primaryKey().notNull(),
  code: nvarchar("code", { length: 200 }),
  subjectId: int("subject_id"),
  semesterId: int("semester_id"),
  roomId: int("room_id"),
  active: bit("active").notNull().default(true),
  name: nvarchar("name", { length: "max" }).notNull(),
  subject: nvarchar("subject", { length: "max" }).notNull(),
  room: nvarchar("room", { length: "max" }).notNull(),
  latitude: float("latitude", { precision: 53 }),
  longitude: float("longitude", { precision: 53 }),
  checkInRadiusMeters: int("check_in_radius_meters").notNull().default(50),
});

export const countSnapshotsTable = mssqlTable("count_snapshots", {
  id: int("id").identity().primaryKey().notNull(),
  sessionId: int("session_id").notNull(),
  estimatedCount: int("estimated_count").notNull(),
  confidence: float("confidence", { precision: 53 }).notNull(),
  source: nvarchar("source", { length: "max" }).notNull(),
  capturedAt: datetimeoffset("captured_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
});

export const courseEnrollmentsTable = mssqlTable("course_enrollments", {
  id: int("id").identity().primaryKey().notNull(),
  classId: int("class_id").notNull(),
  studentId: int("student_id").notNull(),
  enrolledAt: datetimeoffset("enrolled_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
  withdrawnAt: datetimeoffset("withdrawn_at", { mode: "date", precision: 3 }),
});

export const schoolInvitationsTable = mssqlTable("school_invitations", {
  id: int("id").identity().primaryKey().notNull(),
  email: nvarchar("email", { length: 320 }).notNull(),
  clerkInvitationId: nvarchar("clerk_invitation_id", { length: 200 }).notNull(),
  status: nvarchar("status", { length: "max" }).notNull().default("pending"),
  createdBySchoolUserId: int("created_by_school_user_id"),
  createdAt: datetimeoffset("created_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
  acceptedAt: datetimeoffset("accepted_at", { mode: "date", precision: 3 }),
  acceptedUserId: nvarchar("accepted_user_id", { length: "max" }),
});

export const schoolUsersTable = mssqlTable("school_users", {
  id: int("id").identity().primaryKey().notNull(),
  clerkUserId: nvarchar("clerk_user_id", { length: 200 }).notNull(),
  email: nvarchar("email", { length: "max" }).notNull().default(""),
  displayName: nvarchar("display_name", { length: "max" }).notNull().default("Tài khoản mới"),
  phone: nvarchar("phone", { length: "max" }),
  faculty: nvarchar("faculty", { length: "max" }),
  major: nvarchar("major", { length: "max" }),
  staffCode: nvarchar("staff_code", { length: 200 }),
  active: bit("active").notNull().default(true),
  role: nvarchar("role", { length: "max" }).notNull().default("pending"),
  studentId: int("student_id"),
  createdAt: datetimeoffset("created_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
});

export const studentsTable = mssqlTable("students", {
  id: int("id").identity().primaryKey().notNull(),
  classId: int("class_id"),
  cohortId: int("cohort_id"),
  active: bit("active").notNull().default(true),
  fullName: nvarchar("full_name", { length: "max" }).notNull(),
  studentCode: nvarchar("student_code", { length: 200 }).notNull(),
});

export const teacherClassAssignmentsTable = mssqlTable("teacher_class_assignments", {
  id: int("id").identity().primaryKey().notNull(),
  schoolUserId: int("school_user_id").notNull(),
  classId: int("class_id").notNull(),
  createdAt: datetimeoffset("created_at", { mode: "date", precision: 3 }).notNull().default(sql`sysdatetimeoffset()`),
});
