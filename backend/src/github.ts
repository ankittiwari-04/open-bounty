import { commitShaFromHex } from "./attestation.ts";

export interface VerifiedMerge {
  prNumber: bigint;
  commitSha: Uint8Array; // 20 raw bytes
  githubUserId: bigint; // PR author
  mergeTimestamp: bigint; // unix seconds
  repoFullName: string;
  body?: string; // PR description; candidate-discovery use ONLY, never authorization
  /** Same-repo issues GitHub says this PR closes (authoritative). Used for discovery. */
  closingIssues?: bigint[];
}

export interface VerifyOpts {
  fetchFn?: typeof fetch;
  token: string; // required: GraphQL needs auth
  repoFullName: string; // "owner/repo"
  prNumber: bigint;
  /**
   * The funded issue. When provided, the PR must formally close it
   * (checked via GitHub's authoritative closingIssuesReferences) or this
   * throws. Omit ONLY for cheap candidate discovery (e.g. reading `body`
   * to guess which issues a PR might close) -- never omit this when the
   * result will be used to authorize a payout.
   */
  issueNumber?: bigint;
  expectedBaseRef?: string; // e.g. "main"
}

function parseOwnerRepo(full: string): { owner: string; repo: string } {
  const [owner, repo] = full.split("/");
  if (!owner || !repo) throw new Error("bad repo name");
  return { owner, repo };
}

async function fetchClosingIssues(
  f: typeof fetch,
  token: string,
  owner: string,
  repo: string,
  prNumber: bigint,
): Promise<{ number: number; repoFullName: string }[]> {
  const query = `
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          closingIssuesReferences(first: 50) {
            nodes { number repository { owner { login } name } }
          }
        }
      }
    }`;
  const res = await f("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "open-bounty-attestor",
    },
    body: JSON.stringify({ query, variables: { owner, repo, pr: Number(prNumber) } }),
  });
  if (!res.ok) throw new Error(`github graphql ${res.status}`);
  const json: any = await res.json();
  if (json.errors) throw new Error("github graphql error: " + JSON.stringify(json.errors));
  const nodes = json?.data?.repository?.pullRequest?.closingIssuesReferences?.nodes ?? [];
  return nodes.map((n: any) => ({
    number: n.number,
    repoFullName: `${n.repository.owner.login}/${n.repository.name}`,
  }));
}

/** Re-fetches the PR from GitHub and confirms it formally closes `issueNumber`. */
export async function verifyMergedPr(o: VerifyOpts): Promise<VerifiedMerge> {
  const f = o.fetchFn ?? fetch;
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repoFullName)) throw new Error("bad repo name");
  const { owner, repo } = parseOwnerRepo(o.repoFullName);

  const url = `https://api.github.com/repos/${o.repoFullName}/pulls/${o.prNumber}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${o.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "open-bounty-attestor",
  };

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

  // Authoritative check: does GitHub's own closing-issue relation include
  // the funded issue? Never trust "Fixes #N" text in the PR body — GitHub
  // itself may disagree (wrong branch, edited after merge, etc.).
  const closing = await fetchClosingIssues(f, o.token, owner, repo, o.prNumber);
  const sameRepoClosing = closing
    .filter((c) => c.repoFullName.toLowerCase() === o.repoFullName.toLowerCase())
    .map((c) => BigInt(c.number));
  if (o.issueNumber !== undefined && !sameRepoClosing.includes(o.issueNumber))
    throw new Error("pr does not close the funded issue");

  return {
    prNumber: o.prNumber,
    commitSha: commitShaFromHex(String(pr.merge_commit_sha)),
    githubUserId: BigInt(pr.user.id),
    mergeTimestamp: BigInt(Math.floor(ms / 1000)),
    repoFullName: base,
    closingIssues: sameRepoClosing,
  };
}
