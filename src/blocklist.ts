import { sha256 } from "@noble/hashes/sha2";

export type BlocklistAction = "listed" | "delisted";

export interface BlocklistEvent {
  wallet: string;
  action: BlocklistAction;
  epoch: number;
  timestamp: string;
  reasonHash: string;
  adminCostLamports: string;
  obligationLamports: string;
}

export interface BlocklistRecoveryInput {
  obligationLamports: bigint | number | string;
  entryAdminCostLamports: bigint | number | string;
  exitAdminCostLamports: bigint | number | string;
  protocolFeeBps?: number;
}

export interface BlocklistRecoveryRequirement {
  obligationLamports: string;
  adminCostEntryLamports: string;
  adminCostExitLamports: string;
  protocolFeeLamports: string;
  unlockTotalLamports: string;
}

export const BLOCKLIST_ACTION_LISTED = 1;
export const BLOCKLIST_ACTION_DELISTED = 2;
export const BLOCKLIST_PROTOCOL_FEE_BPS = 1_000;

function toBigIntLamports(value: bigint | number | string): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }

  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

function domainHash(domain: string, ...parts: Uint8Array[]): string {
  const encoder = new TextEncoder();
  const domainBytes = encoder.encode(domain);
  const size = parts.reduce((total, part) => total + part.length, domainBytes.length);
  const payload = new Uint8Array(size);
  payload.set(domainBytes, 0);
  let offset = domainBytes.length;
  for (const part of parts) {
    payload.set(part, offset);
    offset += part.length;
  }

  return bytesToHex(sha256(payload));
}

export function blocklistLeafHashHex(pubkeyBytes: Uint8Array): string {
  if (pubkeyBytes.length !== 32) {
    throw new Error("Blocklist wallet pubkey must be 32 bytes.");
  }
  return domainHash("airpay:blocklist:leaf:v1", pubkeyBytes);
}

export function blocklistNodeHashHex(leftHex: string, rightHex: string): string {
  return domainHash("airpay:blocklist:node:v1", hexToBytes(leftHex), hexToBytes(rightHex));
}

export function calculateBlocklistRecoveryRequirement(
  input: BlocklistRecoveryInput,
): BlocklistRecoveryRequirement {
  const obligation = toBigIntLamports(input.obligationLamports);
  const entryAdmin = toBigIntLamports(input.entryAdminCostLamports);
  const exitAdmin = toBigIntLamports(input.exitAdminCostLamports);
  const feeBps = BigInt(input.protocolFeeBps ?? BLOCKLIST_PROTOCOL_FEE_BPS);
  const adminSubtotal = entryAdmin + exitAdmin;
  const protocolFee = (adminSubtotal * feeBps) / 10_000n;
  return {
    obligationLamports: obligation.toString(),
    adminCostEntryLamports: entryAdmin.toString(),
    adminCostExitLamports: exitAdmin.toString(),
    protocolFeeLamports: protocolFee.toString(),
    unlockTotalLamports: (obligation + adminSubtotal + protocolFee).toString(),
  };
}

export function replayActiveBlocklist(events: BlocklistEvent[]): Set<string> {
  const active = new Set<string>();
  const ordered = [...events].sort((left, right) => left.epoch - right.epoch);
  for (const event of ordered) {
    if (event.action === "listed") {
      active.add(event.wallet);
    } else {
      active.delete(event.wallet);
    }
  }
  return active;
}
