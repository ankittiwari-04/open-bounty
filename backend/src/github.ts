import { commitShaFromHex } from "./attestation.ts";

export interface VerifiedMerge {
  prNumber: bigint;
  commitSha: Uint8Array; // 20 raw bytes
  githubUserId: bigint; // PR author
  mergeTimestamp: bigint; // unix seconds
  repoFullName: string;
}

export interface VerifyOpts {
  fetchFn?: typeof fetch;
  token?: string;
  repoFullName: string; // "owner/repo"
  prNumber: bigint;
  expectedBaseRef?: string; // e.g. "main"
}

/** Re-fetches the PR from GitHub and returns only what GitHub itself confirms. */
export async function verifyMergedPr(o: VerifyOpts): Promise<VerifiedMerge> {
  const f = o.fetchFn ?? fetch;
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repoFullName)) throw new Error("bad repo name");
  const url = `https://api.github.com/repos/${o.repoFullName}/pulls/${o.prNumber}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "open-bounty-attestor",
  };
  if (o.token) headers.Authorization = `Bearer ${o.token}`;

  const res = await f(url, { headers });
  if (!res.ok) throw new Error(`github api ${res.status}`);
  const pr: any = await res.json();

  if (BigInt(pr?.number ?? -1) !== o.prNumber) throw new Error("pr number mismatch");
  if (pr.merged !== true) throw new Error("pr not merged");
  if (pr.state !== "closed") throw new Error("pr not closed");
  const base = pr.base?.repo?.full_name;
  if (typeof base !== "string" || base.toLowerCase() !== o.repoFullName.toLowerCase())
    throw new Error("repo mismatch");
  if (o.expectedBaseRef && pr.base?.ref !== o.expectedBaseRef) throw new Error("base branch mismatch");
  if (!Number.isSafeInteger(pr.user?.id) || pr.user.id <= 0) throw new Error("bad author id");
  const ms = Date.parse(pr.merged_at);
  if (!Number.isFinite(ms)) throw new Error("bad merged_at");

  return {
    prNumber: o.prNumber,
    commitSha: commitShaFromHex(String(pr.merge_commit_sha)),
    githubUserId: BigInt(pr.user.id),
    mergeTimestamp: BigInt(Math.floor(ms / 1000)),
    repoFullName: base,
  };
}
