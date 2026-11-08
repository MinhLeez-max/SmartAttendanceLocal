import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve("lib/db/package.json"));
const { ConnectionPool } = require("mssql");
const config = {
  server: process.env.SQLSERVER_HOST || "127.0.0.1", port: Number(process.env.SQLSERVER_PORT || 1433),
  database: process.env.SQLSERVER_DATABASE, user: process.env.SQLSERVER_USER, password: process.env.SQLSERVER_PASSWORD,
  options: { encrypt: true, trustServerCertificate: process.env.SQLSERVER_TRUST_CERTIFICATE === "true", useUTC: true, enableArithAbort: true },
};
if (config.database !== "SmartAttendanceLocal") throw new Error("SQLSERVER_DATABASE phải là SmartAttendanceLocal.");
if (!config.user || !config.password || config.password.includes("REPLACE_")) throw new Error("Điền tài khoản SQL Server vào .env trên máy bạn.");
const pool = new ConnectionPool(config);
try {
  await pool.connect();
  const result = await pool.request().query("SELECT version FROM dbo.local_schema_version");
  if (result.recordset[0]?.version !== 1) throw new Error("Cấu trúc không đúng phiên bản.");
  const required = ["academic_catalog","academic_lessons","attendance_audits","attendance_records","attendance_sessions","classrooms","count_snapshots","course_enrollments","school_invitations","school_users","students","teacher_class_assignments"];
  const tables = (await pool.request().query("SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')")).recordset.map(r => r.name);
  if (required.some(name => !tables.includes(name))) throw new Error("Thiếu bảng. Chạy sql/02-schema.sql trên database mới, trống.");
  process.stdout.write("Kết nối và phiên bản cấu trúc SQL Server: ĐẠT.\nKhông có mật khẩu hoặc bản ghi cá nhân được in ra.\n");
} catch (error) {
  process.stderr.write(`Kiểm tra chưa đạt. Mã lỗi: ${error.number || error.code || "SCHEMA_OR_CONFIG"}. Kiểm tra dịch vụ, cổng, database, tài khoản và script SQL. Không gửi file .env khi báo lỗi.\n`);
  process.exitCode = 1;
} finally { await pool.close(); }
