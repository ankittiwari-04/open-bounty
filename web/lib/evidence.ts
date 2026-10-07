import { DEMO } from "./demo";
import cap from "./captured.json";
import type { SettlementEvidence } from "./types";

const C = cap as { mergedAt?: string; commitSha?: string; fundedAt?: string; releasedAt?: string; deadline?: string };
const hms = (s?: string) => (s ? s.slice(11, 19) : "");
const full = (s?: string) => (s ? `${s.slice(0, 10)} ${s.slice(11, 19)} UTC` : undefined);
const gh = `https://github.com/${DEMO.repo}`;
const ex = `https://explorer.solana.com/tx/${DEMO.txid}?cluster=devnet`;

export const DEMO_EVIDENCE: SettlementEvidence = {
  isDemoData: true, isCompleted: true, onchainStatus: "paid",
  repository: DEMO.repo, issueNumber: DEMO.issue, issueTitle: DEMO.issueTitle, issueUrl: `${gh}/issues/${DEMO.issue}`,
  prNumber: DEMO.pr, prUrl: `${gh}/pull/${DEMO.pr}`, commitSha: C.commitSha, payoutWallet: DEMO.recipient,
  amountDisplay: `${DEMO.amount} mock USDC`, amountBaseUnits: "10000000", deadlineDisplay: full(C.deadline) ?? DEMO.deadline,
  mergeTimestamp: full(C.mergedAt), releasedTimestamp: full(C.releasedAt),
  attestorPubkey: DEMO.attestor, transactionSignature: DEMO.txid, explorerUrl: ex,
  events: [
    { id: "e1", timestamp: "", source: "github", stage: "issue_funded", title: "Issue selected for funding", description: `${DEMO.repo} #${DEMO.issue}`, href: `${gh}/issues/${DEMO.issue}` },
    { id: "e2", timestamp: hms(C.fundedAt), source: "solana", stage: "issue_funded", title: "Escrow funded", description: `${DEMO.amount} mock USDC locked` },
    { id: "e3", timestamp: hms(C.mergedAt), source: "github", stage: "pr_merged", title: `Pull request #${DEMO.pr} merged`, href: `${gh}/pull/${DEMO.pr}` },
    { id: "e4", timestamp: hms(C.mergedAt), source: "github", stage: "pr_merged", title: `Closing issue #${DEMO.issue} confirmed`, description: "Confirmed through GitHub's closing-issue relation" },
    { id: "e5", timestamp: "", source: "identity", stage: "pr_merged", title: "Contributor wallet matched", description: "PR author's GitHub account maps to a bound wallet" },
    { id: "e6", timestamp: "", source: "attestor", stage: "attestation_signed", title: "Ed25519 authorization signed" },
    { id: "e7", timestamp: "", source: "solana", stage: "payment_submitted", title: "Release transaction submitted" },
    { id: "e8", timestamp: hms(C.releasedAt), source: "solana", stage: "settled", title: `${DEMO.amount} mock USDC settled`, href: ex },
  ],
};
