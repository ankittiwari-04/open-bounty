import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMergedPr } from "./github.ts";

const good = () => ({
  number: 99,
  state: "closed",
  merged: true,
  merge_commit_sha: "03".repeat(20),
  merged_at: "2023-11-14T22:13:20Z",
  user: { id: 555 },
  base: { ref: "main", repo: { full_name: "Owner/Repo" } },
});
const mk = (over: object = {}, ok = true): typeof fetch =>
  (async () => ({ ok, status: ok ? 200 : 404, json: async () => ({ ...good(), ...over }) })) as any;
const opts = (fetchFn: typeof fetch) => ({ fetchFn, repoFullName: "owner/repo", prNumber: 99n });

test("returns verified facts for a merged PR", async () => {
  const v = await verifyMergedPr({ ...opts(mk()), expectedBaseRef: "main" });
  assert.equal(v.githubUserId, 555n);
  assert.equal(v.mergeTimestamp, 1_700_000_000n);
  assert.equal(v.commitSha.length, 20);
});
test("rejects unmerged PR", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ merged: false }))));
});
test("rejects wrong repo", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ base: { ref: "main", repo: { full_name: "evil/repo" } } }))));
});
test("rejects wrong PR number", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ number: 100 }))));
});
test("rejects wrong base branch", async () => {
  await assert.rejects(verifyMergedPr({ ...opts(mk({ base: { ref: "dev", repo: { full_name: "owner/repo" } } })), expectedBaseRef: "main" }));
});
test("rejects bad commit sha and missing author", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ merge_commit_sha: "xyz" }))));
  await assert.rejects(verifyMergedPr(opts(mk({ user: null }))));
});
test("rejects API errors and bad repo names", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({}, false))));
  await assert.rejects(verifyMergedPr({ ...opts(mk()), repoFullName: "../etc/passwd" }));
});
