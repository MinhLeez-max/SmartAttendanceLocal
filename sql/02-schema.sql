-- SQL Server 2022. Creates EMPTY application tables only. Does not delete or overwrite anything.
USE [SmartAttendanceLocal];
GO
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET QUOTED_IDENTIFIER ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
IF DB_NAME() <> N'SmartAttendanceLocal' THROW 50001, 'Wrong database', 1;
IF EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0) THROW 50002, 'Database is not empty. No changes were made.', 1;
BEGIN TRANSACTION;
CREATE TABLE [dbo].[academic_catalog] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [kind] nvarchar(200) NOT NULL,
  [code] nvarchar(200) NOT NULL,
  [name] nvarchar(max) NOT NULL,
  [active] bit NOT NULL DEFAULT 1,
  [start_date] date NULL,
  [end_date] date NULL,
  [faculty] nvarchar(max) NULL,
  [major] nvarchar(max) NULL,
  [latitude] float(53) NULL,
  [longitude] float(53) NULL,
  [check_in_radius_meters] int NOT NULL DEFAULT 50
);

CREATE TABLE [dbo].[academic_lessons] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [class_id] int NOT NULL,
  [teacher_id] int NOT NULL,
  [room_id] int NOT NULL,
  [starts_at] datetimeoffset(3) NOT NULL,
  [ends_at] datetimeoffset(3) NOT NULL,
  [status] nvarchar(max) NOT NULL DEFAULT N'scheduled',
  [reason] nvarchar(max) NULL
);

CREATE TABLE [dbo].[attendance_audits] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [record_id] int NOT NULL,
  [actor_id] int NOT NULL,
  [actor_name] nvarchar(max) NOT NULL,
  [before_status] nvarchar(max) NOT NULL,
  [after_status] nvarchar(max) NOT NULL,
  [reason] nvarchar(max) NOT NULL,
  [created_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset()
);

CREATE TABLE [dbo].[attendance_records] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [session_id] int NOT NULL,
  [student_id] int NOT NULL,
  [status] nvarchar(max) NOT NULL DEFAULT N'present',
  [checked_in_at] datetimeoffset(3) NULL,
  [note] nvarchar(max) NULL,
  [updated_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset()
);

CREATE TABLE [dbo].[attendance_sessions] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [lesson_id] int NULL,
  [roster_captured] bit NOT NULL DEFAULT 0,
  [latitude] float(53) NULL,
  [longitude] float(53) NULL,
  [check_in_radius_meters] int NOT NULL DEFAULT 50,
  [class_id] int NOT NULL,
  [status] nvarchar(max) NOT NULL DEFAULT N'active',
  [started_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset(),
  [ended_at] datetimeoffset(3) NULL,
  [qr_token] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [qr_expires_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset()
);

CREATE TABLE [dbo].[classrooms] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [code] nvarchar(200) NULL,
  [subject_id] int NULL,
  [semester_id] int NULL,
  [room_id] int NULL,
  [active] bit NOT NULL DEFAULT 1,
  [name] nvarchar(max) NOT NULL,
  [subject] nvarchar(max) NOT NULL,
  [room] nvarchar(max) NOT NULL,
  [latitude] float(53) NULL,
  [longitude] float(53) NULL,
  [check_in_radius_meters] int NOT NULL DEFAULT 50
);

CREATE TABLE [dbo].[count_snapshots] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [session_id] int NOT NULL,
  [estimated_count] int NOT NULL,
  [confidence] float(53) NOT NULL,
  [source] nvarchar(max) NOT NULL,
  [captured_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset()
);

CREATE TABLE [dbo].[course_enrollments] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [class_id] int NOT NULL,
  [student_id] int NOT NULL,
  [enrolled_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset(),
  [withdrawn_at] datetimeoffset(3) NULL
);

CREATE TABLE [dbo].[school_invitations] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [email] nvarchar(320) NOT NULL,
  [clerk_invitation_id] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [status] nvarchar(max) NOT NULL DEFAULT N'pending',
  [created_by_school_user_id] int NULL,
  [created_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset(),
  [accepted_at] datetimeoffset(3) NULL,
  [accepted_user_id] nvarchar(max) COLLATE Latin1_General_100_BIN2 NULL
);

CREATE TABLE [dbo].[school_users] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [clerk_user_id] nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
  [email] nvarchar(max) NOT NULL DEFAULT N'',
  [display_name] nvarchar(max) NOT NULL DEFAULT N'Tài khoản mới',
  [phone] nvarchar(max) NULL,
  [faculty] nvarchar(max) NULL,
  [major] nvarchar(max) NULL,
  [staff_code] nvarchar(200) NULL,
  [active] bit NOT NULL DEFAULT 1,
  [role] nvarchar(max) NOT NULL DEFAULT N'pending',
  [student_id] int NULL,
  [created_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset()
);

CREATE TABLE [dbo].[students] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [class_id] int NULL,
  [cohort_id] int NULL,
  [active] bit NOT NULL DEFAULT 1,
  [full_name] nvarchar(max) NOT NULL,
  [student_code] nvarchar(200) NOT NULL
);

CREATE TABLE [dbo].[teacher_class_assignments] (
  [id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
  [school_user_id] int NOT NULL,
  [class_id] int NOT NULL,
  [created_at] datetimeoffset(3) NOT NULL DEFAULT sysdatetimeoffset()
);

ALTER TABLE [dbo].[academic_lessons] ADD CONSTRAINT [academic_lessons_class_id_classrooms_id_fk] FOREIGN KEY ([class_id]) REFERENCES [dbo].[classrooms] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[academic_lessons] ADD CONSTRAINT [academic_lessons_teacher_id_school_users_id_fk] FOREIGN KEY ([teacher_id]) REFERENCES [dbo].[school_users] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[academic_lessons] ADD CONSTRAINT [academic_lessons_room_id_academic_catalog_id_fk] FOREIGN KEY ([room_id]) REFERENCES [dbo].[academic_catalog] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[attendance_audits] ADD CONSTRAINT [attendance_audits_record_id_attendance_records_id_fk] FOREIGN KEY ([record_id]) REFERENCES [dbo].[attendance_records] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[attendance_audits] ADD CONSTRAINT [attendance_audits_actor_id_school_users_id_fk] FOREIGN KEY ([actor_id]) REFERENCES [dbo].[school_users] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_session_id_attendance_sessions_id_fk] FOREIGN KEY ([session_id]) REFERENCES [dbo].[attendance_sessions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_records_student_id_students_id_fk] FOREIGN KEY ([student_id]) REFERENCES [dbo].[students] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_lesson_id_academic_lessons_id_fk] FOREIGN KEY ([lesson_id]) REFERENCES [dbo].[academic_lessons] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[attendance_sessions] ADD CONSTRAINT [attendance_sessions_class_id_classrooms_id_fk] FOREIGN KEY ([class_id]) REFERENCES [dbo].[classrooms] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[classrooms] ADD CONSTRAINT [classrooms_subject_id_academic_catalog_id_fk] FOREIGN KEY ([subject_id]) REFERENCES [dbo].[academic_catalog] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[classrooms] ADD CONSTRAINT [classrooms_semester_id_academic_catalog_id_fk] FOREIGN KEY ([semester_id]) REFERENCES [dbo].[academic_catalog] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[classrooms] ADD CONSTRAINT [classrooms_room_id_academic_catalog_id_fk] FOREIGN KEY ([room_id]) REFERENCES [dbo].[academic_catalog] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[count_snapshots] ADD CONSTRAINT [count_snapshots_session_id_attendance_sessions_id_fk] FOREIGN KEY ([session_id]) REFERENCES [dbo].[attendance_sessions] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[course_enrollments] ADD CONSTRAINT [course_enrollments_class_id_classrooms_id_fk] FOREIGN KEY ([class_id]) REFERENCES [dbo].[classrooms] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[course_enrollments] ADD CONSTRAINT [course_enrollments_student_id_students_id_fk] FOREIGN KEY ([student_id]) REFERENCES [dbo].[students] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[school_invitations] ADD CONSTRAINT [school_invitations_created_by_school_user_id_school_users_id_fk] FOREIGN KEY ([created_by_school_user_id]) REFERENCES [dbo].[school_users] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[school_users] ADD CONSTRAINT [school_users_student_id_students_id_fk] FOREIGN KEY ([student_id]) REFERENCES [dbo].[students] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[students] ADD CONSTRAINT [students_class_id_classrooms_id_fk] FOREIGN KEY ([class_id]) REFERENCES [dbo].[classrooms] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[students] ADD CONSTRAINT [students_cohort_id_academic_catalog_id_fk] FOREIGN KEY ([cohort_id]) REFERENCES [dbo].[academic_catalog] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[teacher_class_assignments] ADD CONSTRAINT [teacher_class_assignments_school_user_id_school_users_id_fk] FOREIGN KEY ([school_user_id]) REFERENCES [dbo].[school_users] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[teacher_class_assignments] ADD CONSTRAINT [teacher_class_assignments_class_id_classrooms_id_fk] FOREIGN KEY ([class_id]) REFERENCES [dbo].[classrooms] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE UNIQUE INDEX [academic_catalog_kind_code_unique] ON [dbo].[academic_catalog] ([kind], [code]);

CREATE UNIQUE INDEX [attendance_session_student_unique] ON [dbo].[attendance_records] ([session_id], [student_id]);

CREATE UNIQUE INDEX [attendance_sessions_lesson_id_unique] ON [dbo].[attendance_sessions] ([lesson_id]) WHERE [lesson_id] IS NOT NULL;

CREATE UNIQUE INDEX [attendance_sessions_qr_token_unique] ON [dbo].[attendance_sessions] ([qr_token]);

CREATE UNIQUE INDEX [classrooms_code_unique] ON [dbo].[classrooms] ([code]) WHERE [code] IS NOT NULL;

CREATE UNIQUE INDEX [course_enrollments_class_student_unique] ON [dbo].[course_enrollments] ([class_id], [student_id]);

CREATE UNIQUE INDEX [school_invitations_email_unique] ON [dbo].[school_invitations] ([email]);

CREATE UNIQUE INDEX [school_invitations_clerk_id_unique] ON [dbo].[school_invitations] ([clerk_invitation_id]);

CREATE UNIQUE INDEX [school_users_student_id_unique] ON [dbo].[school_users] ([student_id]) WHERE [student_id] IS NOT NULL;

CREATE UNIQUE INDEX [school_users_clerk_user_id_unique] ON [dbo].[school_users] ([clerk_user_id]);

CREATE UNIQUE INDEX [school_users_staff_code_unique] ON [dbo].[school_users] ([staff_code]) WHERE [staff_code] IS NOT NULL;

CREATE UNIQUE INDEX [students_student_code_unique] ON [dbo].[students] ([student_code]);

CREATE UNIQUE INDEX [teacher_class_assignment_unique] ON [dbo].[teacher_class_assignments] ([school_user_id], [class_id]);

ALTER TABLE [dbo].[attendance_records] ADD CONSTRAINT [attendance_status_valid] CHECK ([status] IN (N'present',N'late',N'absent'));

ALTER TABLE [dbo].[academic_lessons] ADD CONSTRAINT [lesson_time_valid] CHECK ([starts_at] < [ends_at]);

ALTER TABLE [dbo].[school_users] ADD CONSTRAINT [school_role_valid] CHECK ([role] IN (N'admin',N'teacher',N'student',N'pending'));
CREATE TABLE [dbo].[local_schema_version] ([version] int NOT NULL PRIMARY KEY);
INSERT INTO [dbo].[local_schema_version] VALUES (1);
COMMIT TRANSACTION;
GO
