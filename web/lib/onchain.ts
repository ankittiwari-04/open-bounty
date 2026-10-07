import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("DNLHZMdnmgxpWWYbqdNcp5xLqvyJ6zxonn27qUAveGch");
export const RPC_URL = "https://api.devnet.solana.com";
export const KNOWN_REPOS = ["ankittiwari-04/open-bounty"];

const LEN = 146;
const DISC = [0xed, 0x10, 0x69, 0xc6, 0x13, 0x45, 0xf2, 0xea]; // sha256("account:Bounty")[0..8]
const STATUSES = ["Funded", "Paid", "Refunded"] as const;
export type OnchainStatus = (typeof STATUSES)[number];

export interface OnchainBounty {
  address: string;
  status: OnchainStatus;
  maintainer: string;
  nonce: bigint;
  amount: bigint;
  repoHash: string;
  issue: bigint;
  deadline: bigint;
  discriminatorHex: string;
  rawLength: number;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(s: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

let _conn: Connection | null = null;
export function getConnection(): Connection {
  return (_conn ??= new Connection(RPC_URL, "confirmed"));
}

export function decodeBounty(address: string, d: Uint8Array): OnchainBounty | null {
  if (d.length < LEN || DISC.some((v, i) => d[i] !== v) || d[8]! > 2) return null;
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return {
    address,
    status: STATUSES[d[8]!]!,
    maintainer: new PublicKey(d.slice(9, 41)).toBase58(),
    nonce: v.getBigUint64(41, true),
    amount: v.getBigUint64(81, true),
    repoHash: hex(d.slice(89, 121)),
    issue: v.getBigUint64(121, true),
    deadline: v.getBigInt64(129, true),
    discriminatorHex: hex(d.slice(0, 8)),
    rawLength: d.length,
  };
}

export async function fetchOnchainBounties(): Promise<OnchainBounty[]> {
  const accts = await getConnection().getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: LEN }] });
  return accts
    .map((a) => decodeBounty(a.pubkey.toBase58(), a.account.data))
    .filter((b): b is OnchainBounty => b !== null)
    .sort((a, b) => (a.nonce < b.nonce ? 1 : -1));
}

export async function getSlot(): Promise<number> {
  return getConnection().getSlot("confirmed");
}

export const formatUsdc = (n: bigint) =>
  (Number(n) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const short = (s: string, a = 4, b = 4) => `${s.slice(0, a)}…${s.slice(-b)}`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
