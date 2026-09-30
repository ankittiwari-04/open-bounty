import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { repoHash } from "./repo.ts";
import { toHex } from "./attestation.ts";

test("repoHash is sha256 of lowercase owner/repo", () => {
  const expected = createHash("sha256").update("owner/repo").digest("hex");
  assert.equal(toHex(repoHash("Owner/Repo")), expected);
  assert.equal(repoHash("Owner/Repo").length, 32);
});
test("repoHash rejects malformed names", () => {
  assert.throws(() => repoHash("../etc/passwd"), RangeError);
  assert.throws(() => repoHash("noslash"), RangeError);
});
