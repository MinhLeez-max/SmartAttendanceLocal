import { drizzle } from "drizzle-orm/node-mssql";
import { AutoPool } from "drizzle-orm/node-mssql/pool";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { MsSqlTable } from "drizzle-orm/mssql-core";
export * from "./schema";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Fill in .env; never put passwords into source code.`);
  return value;
};
export const sqlConfig = {
  server: process.env.SQLSERVER_HOST || "127.0.0.1",
  port: Number(process.env.SQLSERVER_PORT || 1433),
  database: required("SQLSERVER_DATABASE"),
  user: required("SQLSERVER_USER"),
  password: required("SQLSERVER_PASSWORD"),
  options: { encrypt: true, trustServerCertificate: process.env.SQLSERVER_TRUST_CERTIFICATE === "true", useUTC: true, enableArithAbort: true, abortTransactionOnError: true },
  pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
};
if (sqlConfig.database !== "SmartAttendanceLocal") throw new Error("This clean local edition requires SQLSERVER_DATABASE=SmartAttendanceLocal.");
if (!Number.isInteger(sqlConfig.port) || sqlConfig.port < 1 || sqlConfig.port > 65535) throw new Error("Invalid SQLSERVER_PORT.");
export const db = drizzle({ client: new AutoPool(sqlConfig) });
export const pool = { end: async () => { await (await db.$client.$instance()).close(); } };
export type LocalTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function sqlErrorCode(error: unknown): string | undefined {
  let current: any = error;
  for (let i = 0; i < 6 && current; i++) {
    const number = current.number ?? current.originalError?.info?.number;
    if ([2601, 2627].includes(number)) return "23505";
    if (number === 547) return "23503";
    current = current.cause ?? current.originalError;
  }
  return undefined;
}

/** SQL Server-native serialized upsert; no MERGE race or PostgreSQL syntax. */
export async function upsertReturning<T extends MsSqlTable>(client: any, table: T, values: any, options: { target: any | any[]; set: any }): Promise<InferSelectModel<T>[]> {
  const work = async (tx: any) => {
    await tx.execute(sql`DECLARE @r int; EXEC @r = sys.sp_getapplock @Resource=N'attendance:upsert', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @r < 0 THROW 50010, 'Upsert lock timed out', 1;`);
    const columns = getTableColumns(table);
    const targets = Array.isArray(options.target) ? options.target : [options.target];
    const condition = and(...targets.map((column: any) => {
      const key = Object.keys(columns).find(key => columns[key] === column);
      if (!key || values[key] === undefined) throw new Error("Missing upsert key");
      return eq(column, values[key]);
    }));
    const existing = await tx.select().top(1).from(table).where(condition);
    return existing.length ? tx.update(table).set(options.set).output().where(condition) : tx.insert(table).output().values(values);
  };
  return "rollback" in client ? work(client) : client.transaction(work);
}
