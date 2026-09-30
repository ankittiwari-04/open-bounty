import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PublicKey } from "@solana/web3.js";
import { BindingService } from "./binding.ts";
import { verifyGithubSignature } from "./webhook.ts";

export interface AppDeps {
  webhookSecret: string;
  binding: BindingService;
  /** Verified GitHub user id from an authenticated session (OAuth), or null. NEVER read it from the request body. */
  getSessionUserId: (req: IncomingMessage) => bigint | null;
  /** Called after a verified "PR merged" webhook. Must be idempotent. */
  onMerged: (m: { repoFullName: string; prNumber: bigint }) => Promise<void>;
  /** Persist a verified binding. */
  saveBinding: (githubUserId: bigint, wallet: PublicKey) => Promise<void>;
}

const MAX_BODY = 1_000_000;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createApp(d: AppDeps): Server {
  return createServer(async (req, res) => {
    try {
      if (req.method !== "POST") return send(res, 404, { error: "not found" });
      const raw = await readBody(req);

      if (req.url === "/webhook/github") {
        const sig = req.headers["x-hub-signature-256"];
        if (!verifyGithubSignature(raw, typeof sig === "string" ? sig : undefined, d.webhookSecret))
          return send(res, 401, { error: "bad signature" });
        if (req.headers["x-github-event"] !== "pull_request") return send(res, 200, { ignored: true });
        const p = JSON.parse(raw.toString("utf8"));
        if (p.action !== "closed" || p.pull_request?.merged !== true) return send(res, 200, { ignored: true });
        const repoFullName = p.repository?.full_name;
        const number = p.pull_request?.number;
        if (typeof repoFullName !== "string" || !Number.isSafeInteger(number) || number <= 0)
          return send(res, 400, { error: "bad payload" });
        await d.onMerged({ repoFullName, prNumber: BigInt(number) });
        return send(res, 202, { accepted: true });
      }

      if (req.url === "/binding/issue") {
        const uid = d.getSessionUserId(req);
        if (uid === null) return send(res, 401, { error: "not signed in" });
        const { wallet } = JSON.parse(raw.toString("utf8"));
        return send(res, 200, d.binding.issue(uid, new PublicKey(wallet)));
      }

      if (req.url === "/binding/verify") {
        const uid = d.getSessionUserId(req);
        if (uid === null) return send(res, 401, { error: "not signed in" });
        const { nonce, signature } = JSON.parse(raw.toString("utf8"));
        const r = d.binding.verifyAndConsume(String(nonce), new Uint8Array(Buffer.from(String(signature), "base64")));
        if (r.githubUserId !== uid) return send(res, 403, { error: "session mismatch" });
        await d.saveBinding(r.githubUserId, r.wallet);
        return send(res, 200, { bound: r.wallet.toBase58() });
      }

      return send(res, 404, { error: "not found" });
    } catch (e) {
      const m = e instanceof Error ? e.message : "error";
      return send(res, m === "body too large" ? 413 : 400, { error: m });
    }
  });
}
