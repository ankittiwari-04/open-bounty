import { writeFileSync } from "node:fs";
const REPO = "ankittiwari-04/open-bounty", PR = 4;
const RELEASE = "2rW3NupDR2KugPA86qfHbRFX6Dii9iKSzXzwj5yTXxFmnZA4mhREf7P1VhpAYuLpZxvqieRPqbNGdKVRajeZLcv1";
const FUNDING = "3ZSoaWE4xazsNumPahD2c8oXnHummXTapBZDg6qdMNbWEbAUtCMbYcGWjukHr5tSLpw2xk7TVz4NE9tzaMYavtxm";
const BOUNTY = "9FuyjLaEJeBVrfHi4BL4xLjmQBsAcD1ve8RrkADa1bsF";
const rpc = async (method, params) => {
  const r = await fetch("https://api.devnet.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
};
const iso = (t) => (t ? new Date(t * 1000).toISOString() : undefined);
const out = {};
try {
  const pr = await (await fetch(`https://api.github.com/repos/${REPO}/pulls/${PR}`, { headers: { "User-Agent": "openbounty-capture" } })).json();
  out.mergedAt = pr.merged_at; out.commitSha = pr.merge_commit_sha;
} catch (e) { console.log("github:", e.message); }
try { out.releasedAt = iso((await rpc("getTransaction", [RELEASE, { maxSupportedTransactionVersion: 0 }]))?.blockTime); } catch (e) { console.log("release tx:", e.message); }
try { out.fundedAt = iso((await rpc("getTransaction", [FUNDING, { maxSupportedTransactionVersion: 0 }]))?.blockTime); } catch (e) { console.log("funding tx:", e.message); }
try {
  const acct = await rpc("getAccountInfo", [BOUNTY, { encoding: "base64" }]);
  if (acct?.value) out.deadline = iso(Number(Buffer.from(acct.value.data[0], "base64").readBigInt64LE(129)));
} catch (e) { console.log("bounty:", e.message); }
for (const k of Object.keys(out)) if (!out[k]) delete out[k];
writeFileSync("lib/captured.json", JSON.stringify(out, null, 2) + "\n");
console.log("captured:", out);
