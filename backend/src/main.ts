import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BindingService } from "./binding.ts";
import { verifyMergedPr } from "./github.ts";
import { findFundedBounties } from "./lookup.ts";
import { createMergeProcessor } from "./pipeline.ts";
import { findReceipt } from "./pda.ts";
import { prepareRelease } from "./release.ts";
import { createApp } from "./server.ts";
import { BindingStore } from "./store.ts";
import { submitRelease } from "./submit.ts";
import { readCookie, verifySession } from "./session.ts";

const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const loadKeypair = (path: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));

const rpcUrl = need("RPC_URL");
const programId = new PublicKey(need("PROGRAM_ID"));
const webhookSecret = need("WEBHOOK_SECRET");
const githubToken = process.env.GITHUB_TOKEN;
const expectedBaseRef = process.env.EXPECTED_BASE_REF;
const attestor = loadKeypair(need("ATTESTOR_KEYPAIR_PATH"));
const payer = loadKeypair(need("PAYER_KEYPAIR_PATH"));
const port = Number(process.env.PORT ?? 8787);
const devInsecureSession = process.env.DEV_INSECURE_SESSION === "1";
const sessionSecret = process.env.SESSION_SECRET ?? "";
const oauthCfg =
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.OAUTH_REDIRECT_URI
    ? { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET, redirectUri: process.env.OAUTH_REDIRECT_URI }
    : null;
if (oauthCfg && sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters when OAuth is enabled");

const conn = new Connection(rpcUrl, "confirmed");
const log = (m: string): void => console.log(new Date().toISOString(), m);

const store = new BindingStore(process.env.DB_PATH ?? "./bindings.db");
const binding = new BindingService();

const rpc = {
  getLatestBlockhash: () => conn.getLatestBlockhash("confirmed"),
  sendRawTransaction: (raw: Uint8Array, o?: any) => conn.sendRawTransaction(raw, o),
  confirmTransaction: (a: any, c?: any) => conn.confirmTransaction(a, c),
  getAccountInfo: (a: PublicKey) => conn.getAccountInfo(a),
};

const processMerge = createMergeProcessor({
  log,
  verifyPr: (o) => verifyMergedPr({ ...o, token: githubToken, expectedBaseRef }),
  findBounties: (repo, issue) => findFundedBounties(conn as any, programId, repo, issue),
  release: async (bounty, repoFullName, prNumber) => {
    const tx = await prepareRelease(
      { bounty, repoFullName, prNumber, expectedBaseRef },
      {
        programId,
        payer: payer.publicKey,
        attestor,
        githubToken,
        getAccountData: async (a) => (await conn.getAccountInfo(a))?.data ?? null,
        getBoundWallet: async (id) => store.get(id),
      },
    );
    return submitRelease(tx, payer, findReceipt(programId, bounty), rpc as any);
  },
});

if (devInsecureSession) log("WARNING: DEV_INSECURE_SESSION=1, trusting x-dev-github-id header. Never use in production.");

createApp({
  webhookSecret,
  binding,
  oauth: oauthCfg
    ? { ...oauthCfg, sessionSecret, secureCookies: oauthCfg.redirectUri.startsWith("https://") }
    : undefined,
  getSessionUserId: (req) => {
    const fromCookie = verifySession(readCookie(req.headers.cookie, "ob_session"), sessionSecret, Math.floor(Date.now() / 1000));
    if (fromCookie !== null) return fromCookie;
    if (!devInsecureSession) return null;
    const h = req.headers["x-dev-github-id"];
    return typeof h === "string" && /^\d{1,15}$/.test(h) ? BigInt(h) : null;
  },
  saveBinding: async (id, wallet) => { store.save(id, wallet); },
  onMerged: async (m) => {
    // Respond to GitHub immediately; run the payout in the background.
    processMerge(m).catch((e) => log(`merge ${m.repoFullName}#${m.prNumber} failed: ${e instanceof Error ? e.message : e}`));
  },
}).listen(port, () => log(`attestor listening on :${port}, attestor ${attestor.publicKey.toBase58()}`));
