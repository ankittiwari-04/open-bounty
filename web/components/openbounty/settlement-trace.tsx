"use client";
import { Fragment } from "react";
import { nodeViews } from "@/lib/settlement";
import type { SettlementEvidence, WorkflowStage } from "@/lib/types";
import SettlementConnector from "./settlement-connector";
import SettlementNode from "./settlement-node";

export default function SettlementTrace({ evidence, stage, selected, onSelect }: { evidence: SettlementEvidence; stage: WorkflowStage; selected: number | null; onSelect: (i: number) => void }) {
  const views = nodeViews(evidence, stage);
  return (
    <div className="og" role="group" aria-label="Settlement trace: source, escrow, merge, authorization, settlement">
      {views.map((v, i) => (
        <Fragment key={v.key}>
          {i > 0 && <SettlementConnector lit={v.lit} color={v.color} />}
          <SettlementNode v={v} i={i} selected={selected === i} onSelect={onSelect} />
        </Fragment>
      ))}
    </div>
  );
}
