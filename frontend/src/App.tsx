import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchBounties, formatUsdc, getSlot, KNOWN_REPOS, PROGRAM_ID, sha256Hex, type Bounty,
} from "./bounty";

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const addr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const day = (ts: bigint) =>
  new Date(Number(ts) * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

function BootScreen({ lines, done }: { lines: string[]; done: boolean }) {
  return (
    <div className={`boot ${done ? "boot-done" : ""}`} aria-hidden={done}>
      <div className="boot-inner">
        {lines.map((l, i) => (
          <div key={i} className="boot-line">
            {l}
          </div>
        ))}
        {!done && <span className="cursor" />}
      </div>
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState<Bounty[] | null>(null);
  const [error, setError] = useState("");
  const [repos, setRepos] = useState<Record<string, string>>({});
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setItems(await fetchBounties());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load bounties");
    }
  }, []);

  // One orchestrated boot sequence: shows the real RPC + program being read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const push = (l: string) => !cancelled && setBootLines((p) => [...p, l]);
      push("$ connecting to api.devnet.solana.com");
      await new Promise((r) => setTimeout(r, 260));
      push(`$ reading program ${short(PROGRAM_ID.toBase58())}`);
      const bounties = await fetchBounties().catch(() => []);
      if (cancelled) return;
      push(`$ found ${bounties.length} bount${bounties.length === 1 ? "y" : "ies"}`);
      setItems(bounties);
      await new Promise((r) => setTimeout(r, 320));
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
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
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
        repo.toLowerCase().includes(q) ||
        b.status.toLowerCase().includes(q) ||
        b.issue.toString().includes(q) ||
        b.address.toLowerCase().includes(q) ||
        b.maintainer.toLowerCase().includes(q)
      );
    });
  }, [items, repos, query]);

  return (
    <>
      <BootScreen lines={bootLines} done={bootDone} />
      <div className={`wrap ${bootDone ? "" : "wrap-hidden"}`}>
        <header>
          <div className="brand">
            <span className="mark">●</span>OpenBounty
          </div>
          <nav>
            <span className="live">
              <span className="dot" />
              slot {slot ? slot.toLocaleString() : "…"}
            </span>
            <a href="https://github.com/ankittiwari-04/open-bounty" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </header>

        <section className="hero">
          <h1>fund an issue. merge the fix. get paid.</h1>
          <p>
            USDC is held in an on-chain escrow for a GitHub issue and released the moment the pull
            request that closes it is merged. No custodian. No manual payout. Every line below is a
            real account on Solana — expand one to see the raw bytes.
          </p>
        </section>

        <section className="ledger-summary" aria-label="Summary">
          <div>
            <b>{items ? stats.total : "–"}</b>
            <span>bounties</span>
          </div>
          <div>
            <b>${items ? formatUsdc(stats.locked) : "–"}</b>
            <span>locked in escrow</span>
          </div>
          <div>
            <b>${items ? formatUsdc(stats.paid) : "–"}</b>
            <span>paid out</span>
          </div>
        </section>

        <div className="bar">
          <h2>Bounties</h2>
          <div className="bar-actions">
            <input
              ref={searchRef}
              className="search"
              placeholder="/ to search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button onClick={load}>Refresh</button>
          </div>
        </div>

        {error && <p className="err">Could not load bounties from devnet — {error}</p>}
        {!items && !error && <p className="muted">Reading the chain…</p>}
        {items?.length === 0 && <p className="muted">No bounties yet. Fund the first issue to start the ledger.</p>}
        {!!items?.length && filtered.length === 0 && <p className="muted">No bounties match "{query}".</p>}

        <div className="list">
          {filtered.map((b) => {
            const repo = repos[b.repoHash];
            const isOpen = expanded === b.address;
            return (
              <article key={b.address} className={`entry ${b.status}`}>
                <button
                  className="entry-row"
                  onClick={() => setExpanded(isOpen ? null : b.address)}
                  aria-expanded={isOpen}
                >
                  <div className="entry-main">
                    <div className="entry-title">
                      <span className={`status ${b.status}`}>{b.status.toLowerCase()}</span>
                      {repo ? (
                        <span className="repo-link">
                          {repo}#{b.issue.toString()}
                        </span>
                      ) : (
                        <span>unknown repo · issue #{b.issue.toString()}</span>
                      )}
                    </div>
                    <div className="entry-meta">
                      <span>deadline {day(b.deadline)}</span>
                      <span>maintainer {short(b.maintainer)}</span>
                      <span>account {short(b.address)}</span>
                    </div>
                  </div>
                  <div className="entry-amount">${formatUsdc(b.amount)}</div>
                  <span className="chev">{isOpen ? "–" : "+"}</span>
                </button>

                {isOpen && (
                  <div className="proof">
                    <p className="proof-label">
                      This is a real Solana account, decoded client-side — nothing here comes from a database.
                    </p>
                    <dl>
                      <dt>account</dt>
                      <dd>
                        <a href={addr(b.address)} target="_blank" rel="noreferrer">{b.address}</a>
                        <CopyButton value={b.address} />
                      </dd>
                      <dt>discriminator</dt>
                      <dd>0x{b.discriminatorHex} <span className="dim">(sha256("account:Bounty")[0..8])</span></dd>
                      <dt>maintainer</dt>
                      <dd>
                        <a href={addr(b.maintainer)} target="_blank" rel="noreferrer">{b.maintainer}</a>
                        <CopyButton value={b.maintainer} />
                      </dd>
                      <dt>nonce</dt>
                      <dd>{b.nonce.toString()}</dd>
                      <dt>repo hash</dt>
                      <dd>0x{b.repoHash}{repo && <span className="dim"> = sha256("{repo.toLowerCase()}")</span>}</dd>
                      <dt>amount</dt>
                      <dd>{b.amount.toString()} base units (6 decimals)</dd>
                      <dt>account size</dt>
                      <dd>{b.rawLength} bytes</dd>
                    </dl>
                    {repo && (
                      <a className="issue-link" href={`https://github.com/${repo}/issues/${b.issue}`} target="_blank" rel="noreferrer">
                        view issue #{b.issue.toString()} on GitHub
                      </a>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <footer>Test USDC on Solana devnet. Unaudited. Data is read directly from the chain, live.</footer>
      </div>
    </>
  );
}
