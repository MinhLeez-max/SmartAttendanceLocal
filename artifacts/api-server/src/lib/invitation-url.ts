import type { IncomingHttpHeaders } from "node:http";

export function invitationSignUpUrl(headers: IncomingHttpHeaders): string {
  const app = new URL(process.env.APP_URL || "http://localhost:5173");
  if (!["http:", "https:"].includes(app.protocol) || app.username || app.password) throw new Error("Invalid APP_URL");
  const origin = Array.isArray(headers.origin) ? headers.origin[0] : headers.origin;
  if (origin && new URL(origin).origin !== app.origin) throw new Error("Invalid application origin");
  // Never construct invitation redirects from untrusted forwarded host headers.
  return new URL("/sign-up", app.origin).href;
}
