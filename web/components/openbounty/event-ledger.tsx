"use client";
import type { CSSProperties } from "react";
import { CircleDot, FileSignature, Layers, UserCheck } from "lucide-react";
import { nodeForEvent, toneForEvent, visibleEvents } from "@/lib/settlement";
import type { EventSource, SettlementEvidence, WorkflowStage } from "@/lib/types";

const SRC: Record<EventSource, { Icon: typeof CircleDot; name: string }> = {
  github: { Icon: CircleDot, name: "GitHub" }, identity: { Icon: UserCheck, name: "Identity" },
  attestor: { Icon: FileSignature, name: "Attestor" }, solana: { Icon: Layers, name: "Solana" },
};

export default function EventLedger({ evidence, stage, selected, onPick, live }: { evidence: SettlementEvidence; stage: WorkflowStage; selected: number | null; onPick: (n: number) => void; live: boolean }) {
  const shown = visibleEvents(evidence.events, stage);
  return (
    <div className="card">
      <h2>Event ledger{evidence.isDemoData ? " · Demo data" : ""}</h2>
      <p className="note">Workflow events, not on-chain state. Only Funded, Paid and Refunded are on-chain.{evidence.isDemoData ? " Times come from GitHub and Solana; steps without a time were not recorded." : ""}</p>
      {shown.length === 0 && <p style={{ color: "var(--mu)" }}>No events yet.</p>}
      {shown.map((e, i) => {
        const { Icon, name } = SRC[e.source];
        const node = nodeForEvent(e);
        return (
          <button key={e.id} className={`led${live && i === shown.length - 1 ? " fresh" : ""}`} data-hl={selected === node}
            style={{ "--c": toneForEvent(e), gridTemplateColumns: "64px 96px 1fr" } as CSSProperties}
            onClick={() => onPick(node)} aria-label={`${name}: ${e.title}. Show evidence.`}>
            <span className="mono" style={{ color: "var(--mu)", fontSize: 13 }}>{e.timestamp || "—"}</span>
            <span className="src"><Icon size={14} />{name}</span>
            <span><b><i className="dot" />{e.title}</b>{e.description && <span style={{ display: "block", color: "var(--mu)", fontSize: 14 }}>{e.description}</span>}</span>
          </button>
        );
      })}
    </div>
  );
}
