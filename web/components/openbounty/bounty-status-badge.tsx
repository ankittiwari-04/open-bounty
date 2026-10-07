import type { CSSProperties } from "react";
import { Check, Lock, RotateCcw } from "lucide-react";
import type { OnchainBountyStatus } from "@/lib/types";

const MAP = { funded: { Icon: Lock, label: "Funded", c: "var(--purple)" }, paid: { Icon: Check, label: "Paid", c: "var(--lime)" }, refunded: { Icon: RotateCcw, label: "Refunded", c: "var(--orange)" } };

export default function BountyStatusBadge({ status }: { status: OnchainBountyStatus }) {
  const { Icon, label, c } = MAP[status];
  return <span className="badge" style={{ "--c": c, color: c, borderColor: c } as CSSProperties}><Icon size={13} />On-chain state: {label}</span>;
}
