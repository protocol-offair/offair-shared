import { canonicalStringify, sha256Hex } from "./crypto.js";
import { sha3_512 } from "@noble/hashes/sha3.js";
import type {
  DeviceIntegrityState,
  DeviceReputationAnchor,
  ReputationEnvelope,
  WalletIdentityProfile,
} from "./types.js";

export const IDENTITY_DERIVATION_VERSION = 1 as const;
export const DEVICE_REPUTATION_ANCHOR_PROTOCOL_SALT_VERSION = 1 as const;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sha3_512Hex(value: unknown): string {
  const input =
    typeof value === "string" ? new TextEncoder().encode(value) : new TextEncoder().encode(canonicalStringify(value));
  return bytesToHex(sha3_512(input));
}

function normalizeAscii(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function buildIdentityDerivationMaterial(identity: WalletIdentityProfile) {
  return {
    version: IDENTITY_DERIVATION_VERSION,
    walletType: identity.walletType,
    // Civil identity fields are excluded from deterministic derivation. Wallet
    // recovery remains mnemonic-only and portable across devices.
    displayName: normalizeAscii(identity.displayName),
  };
}

export function buildIdentityDerivationContext(identity: WalletIdentityProfile): string {
  return canonicalStringify(buildIdentityDerivationMaterial(identity));
}

export function buildIdentityContextHash(identity: WalletIdentityProfile): string {
  return sha256Hex(buildIdentityDerivationContext(identity));
}

export function buildDeviceReputationAnchor(input: {
  normalizedSignals: Record<string, unknown>;
  installationSalt: string;
  policyHash: string;
  epoch: number;
  derivedAt?: string;
  protocolSaltVersion?: number;
}): DeviceReputationAnchor {
  const protocolSaltVersion = input.protocolSaltVersion ?? DEVICE_REPUTATION_ANCHOR_PROTOCOL_SALT_VERSION;
  const signalHash = sha3_512Hex({
    domain: "airpay:dra:signals:v1",
    signals: input.normalizedSignals,
  });
  const anchorHash = sha3_512Hex({
    domain: "airpay:dra:v1",
    epoch: input.epoch,
    installationSaltHash: sha256Hex(input.installationSalt),
    policyHash: input.policyHash,
    protocolSaltVersion,
    signalHash,
  });

  return {
    anchorHash,
    signalHash,
    epoch: input.epoch,
    protocolSaltVersion,
    derivedAt: input.derivedAt ?? new Date().toISOString(),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addHours(now: string, hours: number): string {
  return new Date(new Date(now).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function buildReputationEnvelope(input: {
  previousEnvelope?: ReputationEnvelope | null;
  existingWalletCount: number;
  unresolvedExposure?: number;
  integrityState?: DeviceIntegrityState;
  now?: string;
}): ReputationEnvelope {
  const now = input.now ?? new Date().toISOString();
  const resetCount = Math.max(0, input.existingWalletCount);
  const lineageGeneration = Math.max(input.previousEnvelope?.lineageGeneration ?? 0, input.existingWalletCount) + 1;
  const unresolvedExposure = Math.max(0, input.unresolvedExposure ?? input.previousEnvelope?.unresolvedExposure ?? 0);
  const reasons: string[] = [];

  let trustCeiling = resetCount === 0 ? 60 : resetCount === 1 ? 45 : resetCount === 2 ? 35 : 25;
  let riskFloor = resetCount === 0 ? 20 : resetCount === 1 ? 35 : resetCount === 2 ? 50 : 65;
  let cooldownHours = resetCount === 0 ? 0 : resetCount === 1 ? 6 : resetCount === 2 ? 24 : 72;

  if (input.previousEnvelope) {
    trustCeiling = Math.min(trustCeiling, input.previousEnvelope.trustCeiling);
    riskFloor = Math.max(riskFloor, input.previousEnvelope.riskFloor);
    if (input.previousEnvelope.cooldownUntil && new Date(input.previousEnvelope.cooldownUntil).getTime() > new Date(now).getTime()) {
      cooldownHours = Math.max(cooldownHours, 24);
      reasons.push("previous lineage cooldown still active");
    }
  }

  if (resetCount > 0) {
    reasons.push("wallet recreation inherits device reputation limits");
  }

  if (unresolvedExposure > 0) {
    trustCeiling -= 20;
    riskFloor += 25;
    cooldownHours = Math.max(cooldownHours, 24);
    reasons.push("unresolved exposure inherited by lineage");
  }

  if (input.integrityState === "rooted") {
    trustCeiling -= 20;
    riskFloor += 25;
    reasons.push("rooted environment caps lineage trust");
  } else if (input.integrityState === "tampered") {
    trustCeiling = 0;
    riskFloor = 95;
    cooldownHours = Math.max(cooldownHours, 168);
    reasons.push("tampered client forces verified-only lineage");
  } else if (input.integrityState === "degraded") {
    trustCeiling -= 10;
    riskFloor += 10;
    reasons.push("degraded integrity reduces lineage exposure");
  }

  trustCeiling = clamp(Math.round(trustCeiling), 0, 100);
  riskFloor = clamp(Math.round(riskFloor), 0, 100);
  const cooldownUntil = cooldownHours > 0 ? addHours(now, cooldownHours) : null;
  const mode =
    trustCeiling <= 0 || riskFloor >= 90
      ? "verified_only"
      : cooldownUntil
        ? "cooldown"
        : riskFloor >= 65 || trustCeiling <= 30
          ? "restricted"
          : resetCount === 0
            ? "new"
            : "stable";

  return {
    trustCeiling,
    riskFloor,
    cooldownUntil,
    lineageGeneration,
    resetCount,
    unresolvedExposure,
    mode,
    updatedAt: now,
    reasons: reasons.length ? [...new Set(reasons)] : ["fresh lineage baseline"],
  };
}

export function isReputationCooldownActive(envelope: ReputationEnvelope, now = new Date().toISOString()): boolean {
  return Boolean(envelope.cooldownUntil && new Date(envelope.cooldownUntil).getTime() > new Date(now).getTime());
}

export function lineageRequiresVerifiedOnly(envelope: ReputationEnvelope): boolean {
  return envelope.mode === "verified_only" || envelope.trustCeiling <= 0 || envelope.riskFloor >= 90;
}

export function computeReputationExposureMultiplier(envelope?: ReputationEnvelope | null, now = new Date().toISOString()): number {
  if (!envelope) {
    return 1;
  }
  if (lineageRequiresVerifiedOnly(envelope)) {
    return 0;
  }
  if (isReputationCooldownActive(envelope, now)) {
    return envelope.riskFloor >= 65 ? 0.2 : 0.35;
  }
  if (envelope.riskFloor >= 75) {
    return 0.2;
  }
  if (envelope.riskFloor >= 55 || envelope.trustCeiling <= 35) {
    return 0.5;
  }
  if (envelope.trustCeiling <= 50) {
    return 0.75;
  }
  return 1;
}

export function applyReputationCeiling(score: number, envelope?: ReputationEnvelope | null): number {
  if (!envelope) {
    return clamp(score, 0, 100);
  }
  return clamp(Math.min(score, envelope.trustCeiling), envelope.riskFloor === 100 ? 100 : 0, 100);
}
