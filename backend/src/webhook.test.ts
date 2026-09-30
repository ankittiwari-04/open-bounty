import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyGithubSignature } from "./webhook.ts";

const secret = "test-secret";
const body = Buffer.from('{"action":"closed"}');
const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

test("accepts a valid signature", () => {
  assert.ok(verifyGithubSignature(body, sig, secret));
});
test("rejects a tampered body", () => {
  assert.ok(!verifyGithubSignature(Buffer.from('{"action":"opened"}'), sig, secret));
});
test("rejects the wrong secret", () => {
  assert.ok(!verifyGithubSignature(body, sig, "other"));
});
test("rejects missing, malformed or wrong-length headers", () => {
  assert.ok(!verifyGithubSignature(body, undefined, secret));
  assert.ok(!verifyGithubSignature(body, "sha256=abc", secret));
  assert.ok(!verifyGithubSignature(body, sig.replace("sha256=", "sha1="), secret));
});
test("rejects an empty secret", () => {
  assert.ok(!verifyGithubSignature(body, sig, ""));
});
