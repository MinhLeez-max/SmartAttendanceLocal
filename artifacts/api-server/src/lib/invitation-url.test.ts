import { test } from "node:test";
import assert from "node:assert/strict";
import { invitationSignUpUrl } from "./invitation-url";
test("local invitations use configured app origin, never request host injection", () => {
  process.env.APP_URL = "http://localhost:5173";
  assert.equal(invitationSignUpUrl({ origin: "http://localhost:5173", host: "localhost:5173" }), "http://localhost:5173/sign-up");
  assert.equal(invitationSignUpUrl({ host: "evil.example", "x-forwarded-host": "evil.example" }), "http://localhost:5173/sign-up");
  assert.throws(() => invitationSignUpUrl({ origin: "https://evil.example" }));
});
