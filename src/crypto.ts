import { randomBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha2";
import type { TransferReceipt } from "./types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = canonicalize((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: unknown): string {
  const input =
    typeof value === "string" ? new TextEncoder().encode(value) : new TextEncoder().encode(canonicalStringify(value));
  return Array.from(sha256(input))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createNonce(prefix = "airpay"): string {
  const entropy = Array.from(randomBytes(8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${entropy}`;
}

export function deriveSessionKey(parts: Record<string, unknown>): string {
  return sha256Hex(parts);
}

export function buildPayloadDigest(payload: unknown): string {
  return sha256Hex(canonicalStringify(payload));
}

export function buildPromiseSigningPayload(input: {
  transferId?: string;
  walletId?: string;
  walletType?: string;
  payload: unknown;
}): { canonicalPayload: string; digest: string } {
  const canonicalPayload = canonicalStringify({
    transferId: input.transferId,
    walletId: input.walletId,
    walletType: input.walletType,
    payload: input.payload,
  });

  return {
    canonicalPayload,
    digest: sha256Hex(canonicalPayload),
  };
}

export function buildReceiptSigningPayload(input: {
  receipt: TransferReceipt;
  transferHash?: string;
}): { canonicalPayload: string; digest: string; payloadHash?: string } {
  const canonicalPayload = canonicalStringify({
    domain: "airpay:receiver-receipt:v1",
    version: 1,
    transferHash: input.transferHash,
    receipt: {
      receiptId: input.receipt.receiptId,
      transferId: input.receipt.transferId,
      receiverPrevTxHash: input.receipt.receiverPrevTxHash,
      ackSignature: input.receipt.ackSignature,
      receivedAt: input.receipt.receivedAt,
      sessionId: input.receipt.sessionId,
      walletId: input.receipt.walletId,
      sessionSettlementMode: input.receipt.sessionSettlementMode,
      claimStatus: input.receipt.claimStatus,
      claimTxSignature: input.receipt.claimTxSignature,
      settleTxSignature: input.receipt.settleTxSignature,
      directSettlementSignature: input.receipt.directSettlementSignature,
      settlementFeePolicy: input.receipt.settlementFeePolicy,
    },
  });

  return {
    canonicalPayload,
    digest: sha256Hex(canonicalPayload),
    payloadHash: input.transferHash,
  };
}

export function deriveStableWalletId(publicKey: string): string {
  return sha256Hex(
    canonicalStringify({
      publicKey,
      version: 1,
    }),
  ).slice(0, 24);
}

export function buildOffAirClaimSigningPayload(input: {
  promiseId: string;
  senderAddress: string;
  receiverAddress: string;
  amountLamports: string;
  offairAmount: string;
  payloadHash: string;
  settlementMode?: number;
  receiptMaterializationRequired?: boolean;
  version?: 1 | 2 | 3;
}): { canonicalPayload: string; digest: string; payloadVersion: 1 | 2 | 3 } {
  const payloadVersion = input.version ?? 3;
  const canonicalPayload =
    payloadVersion === 1
      ? [
          "airpay:offair-claim:v1",
          input.promiseId,
          input.senderAddress,
          input.receiverAddress,
          input.amountLamports,
          input.offairAmount,
          input.payloadHash,
        ].join("|")
      : payloadVersion === 2
        ? [
          "airpay:oac:v2",
          input.promiseId,
          input.senderAddress,
          input.receiverAddress,
          input.amountLamports,
          input.payloadHash,
        ].join("|")
        : [
            "airpay:oac:v3",
            input.promiseId,
            input.senderAddress,
            input.receiverAddress,
            input.amountLamports,
            input.payloadHash,
            String(input.settlementMode ?? 1),
            input.receiptMaterializationRequired ? "1" : "0",
          ].join("|");

  return {
    canonicalPayload,
    digest: sha256Hex(canonicalPayload),
    payloadVersion,
  };
}
