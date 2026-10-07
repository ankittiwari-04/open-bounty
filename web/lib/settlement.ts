import type { OnchainBountyStatus, SettlementEvent, SettlementEvidence, WorkflowStage } from "./types";

export const short = (s?: string, a = 4, b = 4) => (s ? (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s) : "—");

// How many graph nodes are complete at each stage, and how far through the event list we are.
const DONE: Record<WorkflowStage, number> = { issue_funded: 2, pr_pending: 2, pr_merged: 3, attestation_signed: 4, payment_submitted: 4, settled: 5, refund_available: 2, refunded: 2, error: 3 };
const RANK: Record<WorkflowStage, number> = { issue_funded: 1, pr_pending: 2, pr_merged: 3, attestation_signed: 4, payment_submitted: 5, settled: 6, refund_available: 1, refunded: 1, error: 3 };

export const onchainFor = (s: WorkflowStage): OnchainBountyStatus => (s === "settled" ? "paid" : s === "refunded" ? "refunded" : "funded");
export const visibleEvents = (evs: SettlementEvent[], stage: WorkflowStage) => evs.filter((e) => RANK[e.stage] <= RANK[stage]);

export function nodeForEvent(e: SettlementEvent): number {
  if (e.source === "identity" || e.source === "attestor") return 3;
  if (e.source === "github") return e.stage === "issue_funded" ? 0 : 2;
  return e.stage === "issue_funded" ? 1 : 4;
}
export function toneForEvent(e: SettlementEvent): string {
  if (e.stage === "settled") return "var(--lime)";
  if (e.source === "github" && e.stage === "issue_funded") return "var(--blue)";
  if (e.source === "solana" && e.stage === "issue_funded") return "var(--purple)";
  return "var(--gold)";
}

const LABELS = ["GitHub Issue", "Solana Escrow", "Pull Request", "Trusted Attestation", "Payment Receipt"];
const DONE_TXT = ["FUNDED", "LOCKED", "MERGED", "SIGNED", "SETTLED"];
const ORIGIN = ["Off-chain · GitHub", "On-chain · Solana", "Off-chain · GitHub", "Off-chain, checked on-chain", "On-chain · Solana"];
const COLOR = ["var(--blue)", "var(--purple)", "var(--gold)", "var(--gold)", "var(--lime)"];

export interface NodeView { key: string; label: string; state: string; detail: string; origin: string; color: string; status: "done" | "active" | "idle" | "error" | "warn"; lit: boolean }

export function nodeViews(ev: SettlementEvidence, stage: WorkflowStage): NodeView[] {
  const d = DONE[stage];
  const detail = [`Issue #${ev.issueNumber}`, ev.amountDisplay, ev.prNumber ? `PR #${ev.prNumber}` : "—", short(ev.attestorPubkey), short(ev.transactionSignature)];
  return LABELS.map((label, i) => {
    let status: NodeView["status"] = i < d ? "done" : "idle";
    let state = i < d ? DONE_TXT[i] : "WAITING";
    let color = i < d ? COLOR[i] : "#64748B";
    if (stage === "pr_pending" && i === 2) { status = "active"; state = "PENDING"; }
    if (stage === "payment_submitted" && i === 4) { status = "active"; state = "SUBMITTED"; color = COLOR[4]; }
    if (stage === "refund_available" && i === 1) { status = "warn"; state = "REFUND AVAILABLE"; color = "var(--orange)"; }
    if (stage === "refunded" && i === 1) { state = "REFUNDED"; color = "#94A3B8"; }
    if (stage === "error" && i === 3) { status = "error"; state = "INVALID"; color = "var(--red)"; }
    return { key: label, label, state, detail: status === "idle" ? "—" : detail[i], origin: ORIGIN[i], color, status, lit: i > 0 && d > i };
  });
}
