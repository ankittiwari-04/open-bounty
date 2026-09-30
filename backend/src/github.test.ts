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

/**
 * A single mock fetchFn handles both the REST PR lookup and the GraphQL
 * closingIssuesReferences call, branching on the request URL.
 */
function mk(opts: {
  pr?: object;
  ok?: boolean;
  closes?: { number: number; owner: string; repo: string }[];
}): typeof fetch {
  const { pr = {}, ok = true, closes = [{ number: 42, owner: "owner", repo: "repo" }] } = opts;
  return (async (url: any) => {
    const u = String(url);
    if (u.includes("/graphql")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              pullRequest: {
                closingIssuesReferences: {
                  nodes: closes.map((c) => ({
                    number: c.number,
                    repository: { owner: { login: c.owner }, name: c.repo },
                  })),
                },
              },
            },
          },
        }),
      };
    }
    return { ok, status: ok ? 200 : 404, json: async () => ({ ...good(), ...pr }) };
  }) as any;
}

const opts = (fetchFn: typeof fetch) => ({
  fetchFn,
  token: "test-token",
  repoFullName: "owner/repo",
  prNumber: 99n,
  issueNumber: 42n,
});

test("returns verified facts for a merged PR that closes the funded issue", async () => {
  const v = await verifyMergedPr({ ...opts(mk({})), expectedBaseRef: "main" });
  assert.equal(v.githubUserId, 555n);
  assert.equal(v.mergeTimestamp, 1_700_000_000n);
  assert.equal(v.commitSha.length, 20);
});

test("rejects a PR that does not close the funded issue", async () => {
  await assert.rejects(
    verifyMergedPr(opts(mk({ closes: [{ number: 999, owner: "owner", repo: "repo" }] }))),
    /does not close/,
  );
});

test("rejects an empty closing-issues list", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ closes: [] }))), /does not close/);
});

test("rejects a closing reference in a different repo with the same issue number", async () => {
  // GitHub's own field is repo-scoped, so a same-numbered issue in a fork
  // or unrelated repo must not count.
  await assert.rejects(
    verifyMergedPr(opts(mk({ closes: [{ number: 42, owner: "someone-else", repo: "repo" }] }))),
    /does not close/,
  );
});

test("rejects unmerged PR", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ pr: { merged: false } }))));
});
test("rejects wrong repo", async () => {
  await assert.rejects(
    verifyMergedPr(opts(mk({ pr: { base: { ref: "main", repo: { full_name: "evil/repo" } } } }))),
  );
});
test("rejects wrong PR number", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ pr: { number: 100 } }))));
});
test("rejects wrong base branch", async () => {
  await assert.rejects(
    verifyMergedPr({
      ...opts(mk({ pr: { base: { ref: "dev", repo: { full_name: "owner/repo" } } } })),
      expectedBaseRef: "main",
    }),
  );
});
test("rejects bad commit sha and missing author", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ pr: { merge_commit_sha: "xyz" } }))));
  await assert.rejects(verifyMergedPr(opts(mk({ pr: { user: null } }))));
});
test("rejects API errors and bad repo names", async () => {
  await assert.rejects(verifyMergedPr(opts(mk({ ok: false }))));
  await assert.rejects(verifyMergedPr({ ...opts(mk({})), repoFullName: "../etc/passwd" }));
});
