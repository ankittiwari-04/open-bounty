import type { CSSProperties } from "react";
export default function DevnetBadge() {
  return <span className="badge" style={{ "--c": "var(--orange)", color: "var(--orange)", borderColor: "var(--orange)" } as CSSProperties}><i />Solana Devnet</span>;
}
