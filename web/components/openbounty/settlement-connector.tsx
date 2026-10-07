import type { CSSProperties } from "react";
export default function SettlementConnector({ lit, color }: { lit: boolean; color: string }) {
  return <div className="oc" data-lit={lit} style={{ "--c": color } as CSSProperties} aria-hidden="true"><b /><i /></div>;
}
