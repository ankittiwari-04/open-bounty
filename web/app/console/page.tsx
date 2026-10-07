"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, GitPullRequest, CircleDot } from "lucide-react";
import SettlementTrace from "@/components/openbounty/settlement-trace";
import EventLedger from "@/components/openbounty/event-ledger";
import PayoutContractCard from "@/components/openbounty/payout-contract-card";
import BountyStatusBadge from "@/components/openbounty/bounty-status-badge";
import DevnetBadge from "@/components/openbounty/devnet-badge";
import DemoDataBadge from "@/components/openbounty/demo-data-badge";
import SettlementReplay from "@/components/SettlementReplay";
import { EvidenceInspector } from "@/components/panels";
import TrustBoundaryCard from "@/components/openbounty/trust-boundary-card";
import { DISCLAIMER } from "@/lib/copy";
import { DEMO_EVIDENCE as EV } from "@/lib/evidence";
import { NODES } from "@/lib/demo";
import { onchainFor } from "@/lib/settlement";
import type { WorkflowStage } from "@/lib/types";

export default function Console() {
  const [stage, setStage] = useState<WorkflowStage>("settled");
  const [selected, setSelected] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [auto, setAuto] = useState(false);
  useEffect(() => { setAuto(window.location.hash === "#replay"); setReady(true); }, []);

  return (
    <main className="wrap">
      <div className="bar"><Link href="/" className="logo" style={{ textDecoration: "none" }}>OpenBounty</Link><DevnetBadge /></div>
      <header style={{ padding: "12px 0 24px" }}>
        <p className="mono" style={{ color: "var(--mu)", margin: 0, fontSize: 13 }}>SETTLEMENT CONSOLE</p>
        <h1 style={{ fontSize: 36, margin: "6px 0 6px", letterSpacing: "-.02em" }}>{EV.issueTitle}</h1>
        <p className="mono" style={{ color: "var(--mu)", margin: "0 0 14px", fontSize: 13 }}>{EV.repository} · Issue #{EV.issueNumber}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <BountyStatusBadge status={onchainFor(stage)} />
          {EV.isDemoData && <DemoDataBadge />}
          <span className="mono">{EV.amountDisplay}</span>
          <span style={{ color: "var(--mu)" }}>Deadline: {EV.deadlineDisplay}</span>
        </div>
        <div className="cta" style={{ marginTop: 16 }}>
          {EV.issueUrl && <a className="btn" href={EV.issueUrl} target="_blank" rel="noreferrer"><CircleDot size={16} />GitHub issue</a>}
          {EV.prUrl && <a className="btn" href={EV.prUrl} target="_blank" rel="noreferrer"><GitPullRequest size={16} />GitHub PR</a>}
          {EV.explorerUrl && <a className="btn" href={EV.explorerUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Solana Explorer</a>}
        </div>
      </header>

      <div className="card" style={{ padding: 16 }}>
        <SettlementTrace evidence={EV} stage={stage} selected={selected} onSelect={setSelected} />
        <p style={{ margin: "14px 4px 0", color: "var(--mu)", fontSize: 14 }}>
          {selected === null ? "Click a step to open its evidence." : <><b style={{ color: NODES[selected].color }}>{NODES[selected].label}.</b> {NODES[selected].tip}</>}
        </p>
      </div>

      <div className="cols" style={{ marginTop: 20 }}>
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          <EventLedger evidence={EV} stage={stage} selected={selected} onPick={setSelected} live={live} />
          {ready && EV.isCompleted && <SettlementReplay onStage={(s) => { setStage(s); setLive(true); }} autoStart={auto} />}
        </div>
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          <PayoutContractCard evidence={EV} stage={stage} />
          <EvidenceInspector selected={selected} onClose={() => setSelected(null)} />
          <TrustBoundaryCard />
        </div>
      </div>
      <p style={{ color: "var(--mu)", fontSize: 13, padding: "32px 0 48px" }}>Solana Devnet prototype. Mock USDC only. Unaudited. {DISCLAIMER}</p>
    </main>
  );
}
