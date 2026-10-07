import { onchainFor } from "@/lib/settlement";
import type { SettlementEvidence, WorkflowStage } from "@/lib/types";

const Row = ({ k, v, big }: { k: string; v: string; big?: boolean }) => (
  <div className="kv"><dt>{k}</dt><dd className={big ? "big" : ""}>{v}</dd></div>
);

export default function PayoutContractCard({ evidence, stage }: { evidence: SettlementEvidence; stage: WorkflowStage }) {
  const chain = onchainFor(stage);
  const state = chain === "paid" ? "Paid on Solana" : chain === "refunded" ? "Refunded on Solana" : "Funded on Solana";
  return (
    <div className="card">
      <h2>Payout contract</h2>
      <dl style={{ margin: 0 }}>
        <Row k="Amount" v={evidence.amountDisplay} big />
        <Row k="Bounty state" v={state} />
        <Row k="Recipient" v="Bound contributor wallet" />
        <Row k="Trigger" v="Qualifying PR merged to the default branch" />
        <Row k="Issue condition" v={`Must formally close Issue #${evidence.issueNumber}`} />
        <Row k="Deadline" v={evidence.deadlineDisplay} />
        <Row k="Refund rule" v="Deadline + 24-hour grace period" />
        <Row k="Settlement rule" v="One fixed payout only" />
      </dl>
      <details className="what">
        <summary>What does this mean?</summary>
        <p>The amount, the issue and the deadline are stored on Solana when the bounty is funded, and the program checks them at release. It will not pay a different amount, pay twice, or pay for a different issue. The Devnet attestor decides when a merge qualifies, so it is a trusted role. See the trust boundary below.</p>
      </details>
    </div>
  );
}
