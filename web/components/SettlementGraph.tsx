"use client";
import { motion, useReducedMotion } from "framer-motion";
import { CircleDot, Lock, GitMerge, FileSignature, Receipt } from "lucide-react";
import { NODES } from "@/lib/demo";

const ICONS = [CircleDot, Lock, GitMerge, FileSignature, Receipt];
const X = (i: number) => 110 + i * 195;
const Y = (i: number) => (i % 2 ? 250 : 150);

export default function SettlementGraph({ stage, active, onActive }: { stage: number; active: number | null; onActive: (i: number | null) => void }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 1000 400" role="group" aria-label="Merge-to-Settlement graph" className="graph">
      {NODES.slice(0, 4).map((n, i) => {
        const d = `M${X(i)} ${Y(i)} C${X(i) + 95} ${Y(i)}, ${X(i + 1) - 95} ${Y(i + 1)}, ${X(i + 1)} ${Y(i + 1)}`;
        const lit = stage >= i + 2;
        return (
          <g key={n.key}>
            <path d={d} fill="none" stroke="#202838" strokeWidth={2} strokeDasharray="4 6" />
            <motion.path d={d} fill="none" stroke={NODES[i + 1].color} strokeWidth={3} strokeLinecap="round"
              initial={false} animate={{ pathLength: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.7, ease: "easeInOut" }} />
          </g>
        );
      })}
      {NODES.map((n, i) => {
        const Icon = ICONS[i];
        const on = stage > i;
        const sel = active === i;
        return (
          <g key={n.key} role="button" tabIndex={0} aria-label={`${n.label}: ${on ? n.state : "waiting"}. ${n.tip}`}
            onMouseEnter={() => onActive(i)} onMouseLeave={() => onActive(null)} onFocus={() => onActive(i)} onBlur={() => onActive(null)}
            style={{ cursor: "pointer", outline: "none" }}>
            <circle cx={X(i)} cy={Y(i)} r={sel ? 44 : 38} fill="#0E121A" stroke={on ? n.color : "#202838"} strokeWidth={on || sel ? 3 : 2} />
            <Icon x={X(i) - 14} y={Y(i) - 14} width={28} height={28} color={on ? n.color : "#64748B"} />
            <text x={X(i)} y={Y(i) + 68} textAnchor="middle" fill="#F8FAFC" fontSize="15" fontWeight="600">{n.label}</text>
            <text x={X(i)} y={Y(i) + 88} textAnchor="middle" fill={on ? n.color : "#94A3B8"} fontSize="12" className="mono">{on ? n.state : "WAITING"}</text>
          </g>
        );
      })}
    </svg>
  );
}
