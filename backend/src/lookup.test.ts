import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { findFundedBounties } from "./lookup.ts";
import { findBounty } from "./pda.ts";
import { repoHash } from "./repo.ts";

const filled = (b: number, n: number) => new Uint8Array(n).fill(b);
const pk = (b: number) => new PublicKey(filled(b, 32));
const RUST =
  "ed1069c61345f2ea00050505050505050505050505050505050505050505050505050505050505050507000000000000000606060606060606060606060606060606060606060606060606060606060606809698000000000002020202020202020202020202020202020202020202020202020202020202022a0000000000000000f15365000000008051010000000000fe";

const bytes = (status = 0): Uint8Array => {
  const b = Buffer.from(RUST, "hex");
  b[8] = status;
  Buffer.from(repoHash("owner/repo")).copy(b, 89);
  return b;
};
const programId = pk(9);
const good = findBounty(programId, pk(5), 7n);
const mk = (accts: any[], seen: any[] = []) => ({
  getProgramAccounts: async (_p: PublicKey, cfg: any) => { seen.push(cfg); return accts; },
});

test("returns funded bounties for the issue and filters by repo hash", async () => {
  const seen: any[] = [];
  const r = await findFundedBounties(mk([{ pubkey: good, account: { data: bytes() } }], seen), programId, repoHash("owner/repo"), 42n);
  assert.equal(r.length, 1);
  assert.ok(r[0]!.address.equals(good));
  assert.equal(seen[0].filters[0].dataSize, 146);
  assert.equal(seen[0].filters[1].memcmp.offset, 89);
  assert.equal(seen[0].filters[1].memcmp.bytes, new PublicKey(repoHash("owner/repo")).toBase58());
});
test("skips wrong issue, non-funded, spoofed address and junk", async () => {
  const accts = [
    { pubkey: good, account: { data: bytes() } },
    { pubkey: good, account: { data: bytes(1) } },
    { pubkey: pk(77), account: { data: bytes() } },
    { pubkey: good, account: { data: new Uint8Array(146) } },
  ];
  assert.equal((await findFundedBounties(mk(accts), programId, repoHash("owner/repo"), 43n)).length, 0);
  assert.equal((await findFundedBounties(mk(accts), programId, repoHash("owner/repo"), 42n)).length, 1);
});
