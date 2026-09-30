import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyMergedPr } from "./github.ts";

const pr = {
  number: 99, state: "closed", merged: true, merge_commit_sha: "03".repeat(20),
  merged_at: "2023-11-14T22:13:20Z", user: { id: 555 },
  base: { ref: "master", repo: { full_name: "Owner/Repo" } },
};
const gql = (nums: number[], repo: string) => ({
  data: { repository: { pullRequest: { closingIssuesReferences: { nodes: nums.map((n) => ({
    number: n, repository: { owner: { login: repo.split("/")[0] }, name: repo.split("/")[1] },
  })) } } } },
});
const mk = (nums: number[], repo = "Owner/Repo"): typeof fetch =>
  (async (url: string) => ({
    ok: true, status: 200,
    json: async () => (String(url).includes("graphql") ? gql(nums, repo) : pr),
  })) as any;
const base = { token: "t", repoFullName: "owner/repo", prNumber: 99n, expectedBaseRef: "master" };

test("discovery: no issueNumber returns GitHub's closing issues", async () => {
  const v = await verifyMergedPr({ ...base, fetchFn: mk([42, 7]) });
  assert.deepEqual(v.closingIssues, [42n, 7n]);
});
test("discovery ignores issues from other repos", async () => {
  const v = await verifyMergedPr({ ...base, fetchFn: mk([5], "evil/other") });
  assert.deepEqual(v.closingIssues, []);
});
test("authorization: passes when the PR closes the funded issue", async () => {
  const v = await verifyMergedPr({ ...base, issueNumber: 42n, fetchFn: mk([42]) });
  assert.equal(v.githubUserId, 555n);
});
test("authorization: throws when the PR does not close the funded issue", async () => {
  await assert.rejects(verifyMergedPr({ ...base, issueNumber: 43n, fetchFn: mk([42]) }), /does not close/);
});
test("authorization: an issue in another repo does not count", async () => {
  await assert.rejects(verifyMergedPr({ ...base, issueNumber: 42n, fetchFn: mk([42], "evil/other") }), /does not close/);
});
