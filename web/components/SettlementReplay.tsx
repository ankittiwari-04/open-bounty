"use client";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Play, SkipForward } from "lucide-react";
import type { WorkflowStage } from "@/lib/types";

const STEPS: [string, WorkflowStage][] = [
  ["PR merged", "pr_merged"], ["Closing issue confirmed", "pr_merged"], ["Wallet matched", "pr_merged"],
  ["Attestation signed", "attestation_signed"], ["Transaction submitted", "payment_submitted"], ["Settlement completed", "settled"],
];

export default function SettlementReplay({ onStage, autoStart = false }: { onStage: (s: WorkflowStage) => void; autoStart?: boolean }) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const last = STEPS.length - 1;
  const running = step !== null && step < last;
  const stop = () => window.clearTimeout(timer.current);
  const finish = () => { stop(); setStep(last); };
  const start = () => { stop(); setStep(reduce ? last : 0); };

  useEffect(() => {
    if (step === null) return;
    onStage(STEPS[step][1]);
    if (step < last) timer.current = window.setTimeout(() => setStep(step + 1), 1800);
    return stop;
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (autoStart) start(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card" id="replay">
      <h2>Settlement replay</h2>
      {step !== null && <p className="mono" style={{ color: "var(--gold)", fontSize: 13, margin: "0 0 10px" }}>Replaying a completed Devnet settlement</p>}
      <ol className="steps" aria-live="polite">
        {STEPS.map(([label], i) => <li key={label} data-done={step !== null && i <= step} aria-current={i === step ? "step" : undefined}>{label}</li>)}
      </ol>
      <div className="cta" style={{ marginTop: 0 }}>
        <button className="btn pri" onClick={start} disabled={running}><Play size={16} />Replay completed settlement</button>
        {running && <button className="btn" onClick={finish}><SkipForward size={16} />Skip animation</button>}
      </div>
      {reduce && <p style={{ color: "var(--mu)", fontSize: 13 }}>Reduced motion is on, so the replay jumps straight to the result.</p>}
    </div>
  );
}
