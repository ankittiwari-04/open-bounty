import { Ed25519Program, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { serializeAttestation, type MergeAttestationV1 } from "./attestation.ts";

export interface SignedAttestation {
  message: Uint8Array;
  signature: Uint8Array;
  attestor: PublicKey;
}

export function signAttestation(a: MergeAttestationV1, attestor: Keypair): SignedAttestation {
  const message = serializeAttestation(a);
  const signature = nacl.sign.detached(message, attestor.secretKey);
  return { message, signature, attestor: attestor.publicKey };
}

export function buildEd25519Ix(s: SignedAttestation): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: s.attestor.toBytes(),
    message: s.message,
    signature: s.signature,
  });
}
