export type OnchainBountyStatus = "funded" | "paid" | "refunded";
export type WorkflowStage =
  | "issue_funded" | "pr_pending" | "pr_merged" | "attestation_signed"
  | "payment_submitted" | "settled" | "refund_available" | "refunded" | "error";
export type EventSource = "github" | "identity" | "attestor" | "solana";

export type SettlementEvent = {
  id: string; timestamp: string; source: EventSource; stage: WorkflowStage;
  title: string; description?: string; href?: string;
};

export type SettlementEvidence = {
  isDemoData: boolean; isCompleted: boolean; onchainStatus: OnchainBountyStatus;
  repository: string; issueNumber: number; issueTitle: string; issueUrl?: string;
  prNumber?: number; prUrl?: string; commitSha?: string; githubUserId?: string;
  payoutWallet?: string; amountDisplay: string; amountBaseUnits?: string; deadlineDisplay: string;
  mergeTimestamp?: string; releasedTimestamp?: string; attestorPubkey?: string;
  transactionSignature?: string; explorerUrl?: string; events: SettlementEvent[];
};
