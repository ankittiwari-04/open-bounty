import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";

const server = process.env.SERVER_URL ?? "http://localhost:8787";
const p = join(homedir(), "ob-keys/winner.json");
if (!existsSync(p)) writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));

const headers: Record<string, string> = { "content-type": "application/json" };
if (process.env.COOKIE) headers.cookie = `ob_session=${process.env.COOKIE}`;
else if (process.env.DEV_ID) headers["x-dev-github-id"] = process.env.DEV_ID;
else throw new Error("set COOKIE or DEV_ID");

const issued: any = await (await fetch(server + "/binding/issue", { method: "POST", headers, body: JSON.stringify({ wallet: kp.publicKey.toBase58() }) })).json();
if (!issued.nonce) throw new Error("issue failed: " + JSON.stringify(issued));
const signature = Buffer.from(nacl.sign.detached(new TextEncoder().encode(issued.message), kp.secretKey)).toString("base64");
const r = await fetch(server + "/binding/verify", { method: "POST", headers, body: JSON.stringify({ nonce: issued.nonce, signature }) });
console.log(r.status, await r.text());
console.log("winner wallet:", kp.publicKey.toBase58());
