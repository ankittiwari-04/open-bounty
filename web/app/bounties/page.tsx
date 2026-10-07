"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/panels";
import {
  KNOWN_REPOS, PROGRAM_ID, explorerAddr, fetchOnchainBounties, formatUsdc, getSlot,
  sha256Hex, short, type OnchainBounty,
} from "@/lib/onchain";

const day = (ts: bigint) =>
  new Date(Number(ts) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const TONE: Record<string, string> = { Funded: "gold", Paid: "lime", Refunded: "orange" };

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn"
      style={{ padding: "2px 8px", fontSize: 11 }}
      onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

export default function Bounties() {
  const [items, setItems] = useState<OnchainBounty[] | null>(null);
  const [error, setError] = useState("");
  const [repos, setRepos] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setError("");
    try { setItems(await fetchOnchainBounties()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load bounties"); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const push = (l: string) => !cancelled && setBootLines((p) => [...p, l]);
      push("$ connecting to api.devnet.solana.com");
      await new Promise((r) => setTimeout(r, 220));
      push(`$ reading program ${short(PROGRAM_ID.toBase58())}`);
      const bounties = await fetchOnchainBounties().catch(() => []);
      if (cancelled) return;
      push(`$ found ${bounties.length} bount${bounties.length === 1 ? "y" : "ies"}`);
      setItems(bounties);
      await new Promise((r) => setTimeout(r, 260));
      if (!cancelled) setBootDone(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    (async () => {
      const m: Record<string, string> = {};
      for (const r of KNOWN_REPOS) m[await sha256Hex(r.toLowerCase())] = r;
      setRepos(m);
    })();
  }, []);

  useEffect(() => {
    const tick = () => getSlot().then(setSlot).catch(() => {});
    tick();
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") searchRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const stats = useMemo(() => {
    const all = items ?? [];
    const sum = (s: string) => all.filter((b) => b.status === s).reduce((t, b) => t + b.amount, 0n);
    return { total: all.length, locked: sum("Funded"), paid: sum("Paid") };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items ?? [];
    return (items ?? []).filter((b) => {
      const repo = repos[b.repoHash] ?? "";
      return (
        repo.toLowerCase().includes(q) || b.status.toLowerCase().includes(q) ||
        b.issue.toString().includes(q) || b.address.toLowerCase().includes(q) ||
        b.maintainer.toLowerCase().includes(q)
      );
    });
  }, [items, repos, query]);

  return (
    <main className="wrap">
      <div className="bar">
        <Link href="/" className="logo" style={{ textDecoration: "none" }}>OpenBounty</Link>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className="live mono"><span className="dot" />slot {slot ? slot.toLocaleString() : "…"}</span>
          <Link href="/console" className="btn">Watch a settlement</Link>
        </div>
      </div>

      {!bootDone && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="mono" style={{ fontSize: 13, color: "var(--mu)" }}>
            {bootLines.map((l, i) => <div key={i} style={{ color: "var(--tx)", marginBottom: 4 }}>{l}</div>)}
            <span className="caret" />
          </div>
        </div>
      )}

      <header style={{ padding: "20px 0 20px" }}>
        <p className="mono" style={{ color: "var(--mu)", margin: 0, fontSize: 13 }}>Live · Solana Devnet</p>
        <h1 style={{ fontSize: 36, margin: "6px 0 12px", letterSpacing: "-.02em" }}>Every bounty, read straight from the chain</h1>
        <p style={{ color: "var(--mu)", fontSize: 15, maxWidth: "56ch", margin: 0 }}>
          Nothing here comes from a database. Expand a row to see the raw account bytes this page decoded.
        </p>
      </header>

      <div className="cols" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 20 }}>
        <div className="card"><h2>Bounties</h2><p className="big" style={{ margin: 0 }}>{items ? stats.total : "–"}</p></div>
        <div className="card"><h2>Locked in escrow</h2><p className="big" style={{ margin: 0 }}>${items ? formatUsdc(stats.locked) : "–"}</p></div>
        <div className="card"><h2>Paid out</h2><p className="big" style={{ margin: 0 }}>${items ? formatUsdc(stats.paid) : "–"}</p></div>
      </div>

      <div className="bar" style={{ padding: "8px 0" }}>
        <h2 style={{ margin: 0, fontSize: 14 }}>All bounties</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={searchRef} className="mono" placeholder="/ to search" value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ background: "var(--surf)", border: "1px solid var(--bd)", color: "var(--tx)", borderRadius: 8, padding: "6px 10px", fontSize: 13, width: 160 }}
          />
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {error && <p style={{ color: "var(--red)" }}>Could not load bounties from devnet — {error}</p>}
      {!items && !error && <p style={{ color: "var(--mu)" }}>Reading the chain…</p>}
      {items?.length === 0 && <p style={{ color: "var(--mu)" }}>No bounties yet.</p>}
      {!!items?.length && filtered.length === 0 && <p style={{ color: "var(--mu)" }}>No bounties match &quot;{query}&quot;.</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((b) => {
          const repo = repos[b.repoHash];
          const isOpen = expanded === b.address;
          return (
            <article className="card" key={b.address} style={{ padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setExpanded(isOpen ? null : b.address)}
                aria-expanded={isOpen}
                style={{ all: "unset", display: "flex", justifyContent: "space-between", gap: 16, padding: "16px 18px", cursor: "pointer", width: "100%", boxSizing: "border-box" }}
              >
                <div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                    <StatusBadge label={b.status.toUpperCase()} tone={(TONE[b.status] ?? "gold") as never} />
                    {repo ? <span style={{ fontWeight: 600 }}>{repo}#{b.issue.toString()}</span>
                          : <span style={{ color: "var(--mu)" }}>unknown repo · issue #{b.issue.toString()}</span>}
                  </div>
                  <div className="mono" style={{ color: "var(--mu)", fontSize: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <span>deadline {day(b.deadline)}</span>
                    <span>maintainer {short(b.maintainer)}</span>
                    <span>account {short(b.address)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>${formatUsdc(b.amount)}</span>
                  <span className="mono" style={{ color: "var(--mu)" }}>{isOpen ? "–" : "+"}</span>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 18px 18px", borderTop: "1px dashed var(--bd)" }}>
                  <p style={{ color: "var(--mu)", fontSize: 12.5, margin: "14px 0 10px", maxWidth: "48ch" }}>
                    This is a real Solana account, decoded client-side — nothing here comes from a database.
                  </p>
                  <dl style={{ margin: 0 }}>
                    <div className="kv"><dt>account</dt><dd className="mono" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a href={explorerAddr(b.address)} target="_blank" rel="noreferrer">{b.address}</a><CopyButton value={b.address} />
                    </dd></div>
                    <div className="kv"><dt>discriminator</dt><dd className="mono">0x{b.discriminatorHex} <span style={{ color: "var(--mu)" }}>(sha256(&quot;account:Bounty&quot;)[0..8])</span></dd></div>
                    <div className="kv"><dt>maintainer</dt><dd className="mono" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <a href={explorerAddr(b.maintainer)} target="_blank" rel="noreferrer">{b.maintainer}</a><CopyButton value={b.maintainer} />
                    </dd></div>
                    <div className="kv"><dt>nonce</dt><dd className="mono">{b.nonce.toString()}</dd></div>
                    <div className="kv"><dt>repo hash</dt><dd className="mono">0x{b.repoHash}{repo && <span style={{ color: "var(--mu)" }}> = sha256(&quot;{repo.toLowerCase()}&quot;)</span>}</dd></div>
                    <div className="kv"><dt>amount</dt><dd className="mono">{b.amount.toString()} base units (6 decimals)</dd></div>
                    <div className="kv"><dt>account size</dt><dd className="mono">{b.rawLength} bytes</dd></div>
                  </dl>
                  {repo && (
                    <a href={`https://github.com/${repo}/issues/${b.issue}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, color: "var(--blue)", fontSize: 12.5 }}>
                      view issue #{b.issue.toString()} on GitHub
                    </a>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p style={{ color: "var(--mu)", fontSize: 13, padding: "32px 0 48px" }}>
        Test USDC on Solana Devnet. Unaudited. Data is read directly from the chain, live.
      </p>
    </main>
  );
}
