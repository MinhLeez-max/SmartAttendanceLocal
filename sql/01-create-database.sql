-- Run in SSMS as a database administrator. No DROP/TRUNCATE/DELETE.
USE [master];
GO
IF DB_ID(N'SmartAttendanceLocal') IS NULL
    EXEC(N'CREATE DATABASE [SmartAttendanceLocal]');
ELSE
    PRINT N'Database already exists. It was not changed; check it before continuing.';
GO
-- Keep your existing attendance database. 02-schema.sql requires an empty
-- SmartAttendanceLocal and fails rather than overwriting existing tables.
