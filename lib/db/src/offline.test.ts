import { test } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-mssql";
import { and, eq, sql } from "drizzle-orm";
import { schoolUsersTable, attendanceRecordsTable, academicCatalogTable, attendanceSessionsTable, academicLessonsTable } from "./schema";

const db = drizzle.mock();
test("SQL Server queries are parameterized and Unicode-safe without a connection", () => {
  const insert = db.insert(schoolUsersTable).output().values({
    clerkUserId: "offline-user", email: "offline@example.invalid", displayName: "Nguyễn Văn An",
  }).toSQL();
  assert.match(insert.sql, /insert into \[school_users\]/i);
  assert.match(insert.sql, /output inserted\./i);
  assert.ok(insert.params.includes("Nguyễn Văn An"));
  assert.ok(!insert.sql.includes("Nguyễn Văn An"));
  assert.doesNotMatch(insert.sql, /returning|on conflict/i);
});
test("SQL Server TOP is before FROM and update output returns inserted rows", () => {
  const select = db.select().top(1).from(schoolUsersTable).where(eq(schoolUsersTable.clerkUserId, "offline-user")).toSQL();
  assert.match(select.sql, /select top\s*\(/i);
  assert.doesNotMatch(select.sql, /\blimit\b/i);
  const update = db.update(attendanceRecordsTable).set({ status: "late" }).output().where(eq(attendanceRecordsTable.id, 1)).toSQL();
  assert.match(update.sql, /output inserted\./i);
  assert.ok(update.params.includes("late"));
});
test("date-only, instants, booleans and high-precision coordinates use native MSSQL codecs", () => {
  const item = db.insert(academicCatalogTable).values({ kind: "rooms", code: "OFFLINE", name: "Phòng A", active: true, latitude: 10.1234567, longitude: 106.1234567, startDate: "2026-11-08" }).toSQL();
  assert.ok(item.params.includes(10.1234567));
  assert.ok(item.params.includes("2026-11-08"));
  const date = db.select({ deadline: sql`CONVERT(datetimeoffset(3), ${"2026-11-08T00:00:00.000Z"})` }).from(academicCatalogTable).toSQL();
  assert.ok(date.params.includes("2026-11-08T00:00:00.000Z"));
  const joined = db.select().from(attendanceSessionsTable).leftJoin(academicLessonsTable,
    and(eq(attendanceSessionsTable.lessonId, academicLessonsTable.id), eq(attendanceSessionsTable.status, "closed"))).toSQL();
  assert.match(joined.sql, /left join/i);
  assert.ok(joined.params.includes("closed"));
});
