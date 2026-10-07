import { ShieldAlert } from "lucide-react";
import { TRUST } from "@/lib/copy";

const STEPS: [string, string][] = [
  ["GitHub", "Webhook signature + API re-check"],
  ["OpenBounty Devnet Attestor", "Signs release authorization"],
  ["Solana Program", "Enforces fixed amount, recipient, deadline, and one-time settlement"],
  ["Contributor Wallet", "Receives the payout"],
];

export default function TrustBoundaryCard() {
  return (
    <details className="card what">
      <summary style={{ listStyle: "none", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", paddingTop: 0 }}>
        <span><ShieldAlert size={14} style={{ display: "inline", marginRight: 6 }} />Trusted attestor · Devnet prototype</span>
        <span style={{ fontSize: 13 }}>View trust flow</span>
      </summary>
      <p>{TRUST}</p>
      <ol style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
        {STEPS.map(([t, d], i) => (
          <li key={t} style={{ borderLeft: "2px solid var(--bd)", padding: "0 0 14px 14px", marginLeft: 6 }}>
            <b style={{ color: "var(--tx)" }}>{t}</b><br /><span style={{ color: "var(--mu)", fontSize: 14 }}>{d}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" style={{ display: "block", color: "var(--mu)" }}>↓</span>}
          </li>
        ))}
      </ol>
      <p style={{ borderTop: "1px solid var(--bd)", paddingTop: 12 }}><b style={{ color: "var(--tx)" }}>Known MVP limitation:</b> a compromised attestor key could authorize an incorrect payout. OpenBounty reduces exposure through fixed payout amounts, one-time settlement, deadline rules, bounty caps, and Devnet-only operation.</p>
    </details>
  );
}
