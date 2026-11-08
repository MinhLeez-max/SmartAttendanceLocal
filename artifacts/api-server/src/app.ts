import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { sqlErrorCode } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const origin = new URL(process.env.APP_URL || "http://localhost:5173").origin;
app.use(pinoHttp({ logger, serializers: {
  req(req) { return { id: req.id, method: req.method, url: req.url?.split("?")[0] }; },
  res(res) { return { statusCode: res.statusCode }; },
} }));
app.use(cors({ credentials: true, origin }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware({ authorizedParties: [origin] }));
app.use("/api", router);
const errors: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) { next(error); return; }
  if (sqlErrorCode(error) === "23505") { res.status(409).json({ error: "Mã hoặc bản ghi đã tồn tại." }); return; }
  if (sqlErrorCode(error) === "23503") { res.status(400).json({ error: "Thông tin liên kết hoặc dữ liệu không hợp lệ." }); return; }
  req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "API request failed");
  res.status(500).json({ error: "Không thể xử lý yêu cầu. Hãy kiểm tra cấu hình hoặc thử lại." });
};
app.use(errors);
export default app;
