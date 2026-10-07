"use client";
import { useState, type CSSProperties } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { DEMO, LEDGER, type Tone } from "@/lib/demo";
import { DEMO_EVIDENCE } from "@/lib/evidence";

export const DISCLAIMER =
  "Payment receipts show a release event tied to a GitHub issue and merged pull request. They are not proof of skill, work quality, or employment.";

export const TONE: Record<Tone, string> = { blue: "var(--blue)", purple: "var(--purple)", gold: "var(--gold)", lime: "var(--lime)", orange: "var(--orange)" };

export function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return <span className="badge" style={{ "--c": TONE[tone], color: TONE[tone], borderColor: TONE[tone] } as CSSProperties}><i />{label}</span>;
}

export function EventLedger({ count }: { count: number }) {
  const shown = LEDGER.slice(0, count);
  return (
    <div className="card">
      <h2>Event ledger</h2>
      {shown.length === 0 && <p style={{ color: "var(--mu)" }}>No events yet.</p>}
      {shown.map((e) => (
        <div className="led" key={e.title} style={{ "--c": TONE[e.tone] } as CSSProperties}>
          <span className="mono" style={{ color: "var(--mu)", fontSize: 13 }}>{e.t}</span>
          <div><b><i className="dot" />{e.title}</b><div style={{ color: "var(--mu)", fontSize: 14 }}>{e.detail}</div></div>
        </div>
      ))}
    </div>
  );
}

const KV = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => <div className="kv"><dt>{k}</dt><dd className={mono ? "mono" : ""}>{v}</dd></div>;

export function PayoutContractCard({ status }: { status: string }) {
  return (
    <div className="card">
      <h2>Payout contract</h2>
      <dl style={{ margin: 0 }}>
        <KV k="Fixed amount" v={`${DEMO.amount} mock USDC`} />
        <KV k="Recipient" v="Wallet bound to the PR author" />
        <KV k="Exact issue" v={`${DEMO.repo} #${DEMO.issue}`} />
        <KV k="Deadline" v={`${DEMO.deadline} + ${DEMO.grace}`} />
        <KV k="Status" v={status} />
      </dl>
    </div>
  );
}

export function TrustBoundaryCard() {
  return (
    <div className="card" style={{ borderColor: "#3a3320" }}>
      <h2><ShieldAlert size={14} style={{ display: "inline", marginRight: 6 }} />Trust boundary</h2>
      <p style={{ margin: 0, color: "var(--mu)", fontSize: 15 }}>
        GitHub events are off-chain. A trusted Devnet attestor verifies GitHub webhook/API data. The Solana program enforces the recipient, amount, deadline, and one-time settlement.
      </p>
    </div>
  );
}

const NODE_LABELS = ["GitHub Issue", "Solana Escrow", "Pull Request", "Trusted Attestation", "Payment Receipt"];

function evidenceRows(index: number): [string, string][] {
  const ev = DEMO_EVIDENCE;
  switch (index) {
    case 0:
      return [["Repository", ev.repository], ["Issue", `#${ev.issueNumber} ${ev.issueTitle}`], ["Issue URL", ev.issueUrl ?? "—"]];
    case 1:
      return [["Amount", ev.amountDisplay], ["Base units", ev.amountBaseUnits ?? "—"], ["Deadline", ev.deadlineDisplay], ["On-chain status", ev.onchainStatus]];
    case 2:
      return [["Pull request", ev.prNumber ? `#${ev.prNumber}` : "—"], ["PR URL", ev.prUrl ?? "—"], ["Commit SHA", ev.commitSha ?? "Not captured in demo data"]];
    case 3:
      return [["Attestor public key", ev.attestorPubkey ?? "—"], ["Payout wallet", ev.payoutWallet ?? "—"], ["GitHub user id", ev.githubUserId ?? "Not captured in demo data"]];
    case 4:
      return [["Transaction signature", ev.transactionSignature ?? "—"], ["Explorer", ev.explorerUrl ?? "—"], ["Merge timestamp", ev.mergeTimestamp ?? "Not captured in demo data"]];
    default:
      return [];
  }
}

export function EvidenceInspector({ selected, onClose }: { selected: number | null; onClose: () => void }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Evidence inspector</h2>
        {selected !== null && (
          <button className="btn" onClick={onClose} aria-label="Close evidence">
            Close
          </button>
        )}
      </div>
      {selected === null ? (
        <p style={{ color: "var(--mu)", fontSize: 14, margin: "12px 0 0" }}>
          Click a node in the graph or an event in the ledger to see its evidence.
        </p>
      ) : (
        <>
          <p className="mono" style={{ color: "var(--gold)", fontSize: 13, margin: "12px 0 8px" }}>
            {NODE_LABELS[selected]}
          </p>
          <dl style={{ margin: 0 }}>
            {evidenceRows(selected).map(([k, v]) => (
              <div className="kv" key={k}>
                <dt>{k}</dt>
                <dd className="mono">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
