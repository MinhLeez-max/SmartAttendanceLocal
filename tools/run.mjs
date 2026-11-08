import { spawn } from "node:child_process";
import { resolve } from "node:path";
const command = process.argv[2] || "dev";
const node = process.execPath;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = new Set();
let stopping = false;
let serversRunning = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) {
    if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exitCode = code;
}
function start(executable, args, env = {}) {
  const child = spawn(executable, args, { cwd: resolve("."), stdio: "inherit",
    shell: process.platform === "win32" && executable === pnpm,
    env: { ...process.env, NODE_ENV: "development", PORT: "8080", BASE_PATH: "/",
      VITE_CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY, ...env } });
  children.add(child);
  child.on("error", () => { process.stderr.write("Không chạy được tiến trình. Kiểm tra Node.js và pnpm trong PATH.\n"); stop(1); });
  child.on("exit", (code) => { children.delete(child); if (!stopping && (code || serversRunning)) stop(code || 0); });
  return child;
}
function run(executable, args, env) {
  return new Promise((accept, reject) => {
    const child = start(executable, args, env);
    child.once("exit", code => code === 0 ? accept() : reject(new Error("Command failed")));
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
if (command === "build") {
  await run(pnpm, ["run", "typecheck"]);
  await run(pnpm, ["--filter", "@workspace/api-server", "run", "build"]);
  await run(pnpm, ["--filter", "@workspace/smart-attendance", "run", "build"]);
} else if (command === "test") {
  await run(pnpm, ["exec", "tsx", "--test", "artifacts/api-server/src/lib/academic-domain.test.ts"]);
} else if (command === "dev" || command === "start") {
  for (const name of ["SQLSERVER_PASSWORD", "SQLSERVER_USER", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "SCHOOL_BOOTSTRAP_ADMIN_EMAIL"]) {
    if (!process.env[name] || process.env[name].includes("REPLACE_")) throw new Error(`Điền ${name} trong .env trước khi chạy. Không gửi giá trị bí mật cho người khác.`);
  }
  await run(node, ["tools/check.mjs"]);
  serversRunning = true;
  start(pnpm, ["--filter", "@workspace/api-server", "run", command === "dev" ? "dev" : "start"]);
  start(pnpm, ["--filter", "@workspace/smart-attendance", "run", command === "dev" ? "dev" : "serve"]);
  process.stdout.write("\nMở http://localhost:5173 — Ctrl+C để dừng cả hai tiến trình.\n");
} else throw new Error("Use dev, build, start or test");
