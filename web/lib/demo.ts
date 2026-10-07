import cap from "./captured.json";
const CAP = cap as { mergedAt?: string; commitSha?: string };
export type Tone = "blue" | "purple" | "gold" | "lime" | "orange";
export interface GraphNode { key: string; label: string; state: string; color: string; tip: string }
export interface LedgerEntry { t: string; title: string; detail: string; tone: Tone }

// Demo data: seeded from a real Devnet settlement. Items marked "Not captured" were not recorded.
export const DEMO = {
  repo: "ankittiwari-04/open-bounty", issue: 3, issueTitle: "testing", pr: 4, prTitle: "test payout 2",
  amount: "10.00", deadline: "30 days after funding", grace: "24h refund grace after the deadline",
  recipient: "GyAv1XzD2aFf7Pu9Diev7R62ZefFdHfxMfayLFALycTj",
  attestor: "DQstviVNCyFMKRFZiuN3JroRChooeM2wDbpKheUUHcPa",
  txid: "2rW3NupDR2KugPA86qfHbRFX6Dii9iKSzXzwj5yTXxFmnZA4mhREf7P1VhpAYuLpZxvqieRPqbNGdKVRajeZLcv1",
  commitSha: CAP.commitSha ?? "Not captured in demo data", mergeTime: CAP.mergedAt ? `${CAP.mergedAt.slice(0, 10)} ${CAP.mergedAt.slice(11, 19)} UTC` : "Not captured in demo data",
};

export const NODES: GraphNode[] = [
  { key: "issue", label: "GitHub Issue", state: "FUNDED", color: "var(--blue)", tip: "The GitHub issue that was funded. Its repo and number are stored in the bounty, so a payout can only match this exact issue." },
  { key: "vault", label: "Escrow Vault", state: "LOCKED", color: "var(--purple)", tip: "A Solana escrow account controlled only by the program. The mock USDC stays locked until a valid release, or a refund after the deadline plus 24h grace." },
  { key: "pr", label: "Merged PR", state: "MERGED", color: "#D8C58E", tip: "A merged pull request that GitHub reports as closing the issue. This happens off-chain; the attestor reads it from GitHub." },
  { key: "att", label: "Attestation", state: "SIGNED", color: "var(--gold)", tip: "A signed statement from the trusted Devnet attestor naming the bounty, amount and recipient wallet. The program verifies it with Solana's Ed25519 program." },
  { key: "rcpt", label: "Receipt", state: "SETTLED", color: "var(--lime)", tip: "The on-chain receipt created by the one-time release. A second payout for this bounty cannot be created." },
];

export const LEDGER: LedgerEntry[] = [
  { t: "+0s", title: "Issue funded", detail: "10.00 mock USDC committed to issue #3", tone: "blue" },
  { t: "+1s", title: "Vault locked", detail: "Funds held by the program, not by a person", tone: "purple" },
  { t: "+40s", title: "PR merged", detail: "PR #4 merged into the default branch", tone: "gold" },
  { t: "+42s", title: "Wallet matched", detail: "PR author's GitHub account maps to a bound wallet", tone: "gold" },
  { t: "+43s", title: "Attestation signed", detail: "Attestor signed the exact payout terms", tone: "gold" },
  { t: "+46s", title: "Payout settled", detail: "Program verified the signature and paid once", tone: "lime" },
];
