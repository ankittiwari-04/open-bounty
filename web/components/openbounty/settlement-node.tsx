"use client";
import type { CSSProperties } from "react";
import { CircleDot, Lock, GitMerge, FileSignature, Receipt, Check, Clock, X } from "lucide-react";
import type { NodeView } from "@/lib/settlement";

const ICONS = [CircleDot, Lock, GitMerge, FileSignature, Receipt];
const KIND = ["SOURCE", "ESCROW", "MERGE", "AUTHORIZATION", "SETTLEMENT"];

export default function SettlementNode({ v, i, selected, onSelect }: { v: NodeView; i: number; selected: boolean; onSelect: (i: number) => void }) {
  const Icon = ICONS[i];
  const Mark = v.status === "error" ? X : v.status === "done" ? Check : Clock;
  return (
    <button className="on" data-status={v.status} aria-pressed={selected} style={{ "--c": v.color } as CSSProperties}
      onClick={() => onSelect(i)} aria-label={`Step ${i + 1}, ${KIND[i].toLowerCase()}: ${v.label}, ${v.state}. ${v.origin}. Open evidence.`}>
      <span className="kn mono">0{i + 1} {KIND[i]}</span>
      <Icon size={22} color={v.status === "idle" ? "#64748B" : v.color} />
      <span className="lb">{v.label}</span>
      <span className="st"><Mark size={13} />{v.state}</span>
      <span className="dt">{v.detail}</span>
      <span className="or">{v.origin}</span>
    </button>
  );
}
