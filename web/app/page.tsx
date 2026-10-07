"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import SettlementGraph from "@/components/SettlementGraph";
import { StatusBadge } from "@/components/panels";

export default function Landing() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(2);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (reduce) { setStage(5); return; }
    const ids = [3, 4, 5].map((s, i) => window.setTimeout(() => setStage(s), 1400 * (i + 1)));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [reduce]);
  return (
    <main className="wrap">
      <div className="bar"><span className="logo">OpenBounty</span><StatusBadge label="Devnet prototype · mock USDC only" tone="orange" /></div>
      <section className="hero">
        <h1>CODE MERGED.<br />MONEY SETTLED.</h1>
        <p>OpenBounty turns a qualifying GitHub merge into a pre-funded Solana payout.</p>
        <div className="cta">
          <Link className="btn pri" href="/console#replay">Watch a merge settle</Link>
          <Link className="btn" href="/bounties">View live bounties</Link>
          <Link className="btn" href="/console">Explore the console</Link>
        </div>
      </section>
      <SettlementGraph stage={stage} active={active} onActive={setActive} />
      <p className="mono" style={{ color: "var(--mu)", fontSize: 13, textAlign: "center", paddingBottom: 48 }}>Demo data · seeded from a real Devnet settlement</p>
    </main>
  );
}
