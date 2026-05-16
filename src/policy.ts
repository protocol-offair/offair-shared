import {
  DEFAULT_FAST_OFFLINE_TRUSTED_LIMIT_LAMPORTS,
  DEFAULT_VERIFIED_OFFLINE_MIN_LAMPORTS,
  OFFLINE_SETTLEMENT_MODE_FAST,
  OFFLINE_SETTLEMENT_MODE_VERIFIED,
} from "./types";
import { sha256Hex } from "./crypto";
import { computeReputationExposureMultiplier, lineageRequiresVerifiedOnly } from "./identity";
import type {
  AllowlistPolicy,
  ApprovalContext,
  DeviceIntegrityState,
  DeviceManifest,
  OfflineSettlementTier,
  PolicySnapshot,
} from "./types";

export interface CompatibilityResult {
  ok: boolean;
  reasons: string[];
}

export interface OfflineSettlementTierDecision {
  amountLamports: string;
  settlementMode: typeof OFFLINE_SETTLEMENT_MODE_FAST | typeof OFFLINE_SETTLEMENT_MODE_VERIFIED;
  offlineSettlementTier: OfflineSettlementTier;
  receiptMaterializationRequired: boolean;
}

export interface DeviceIntegrityDecision {
  score: number;
  state: DeviceIntegrityState;
  exposureMultiplier: number;
  verifiedOnly: boolean;
  reasons: string[];
}

export function solAmountToLamportsString(amount: number | string): string {
  const normalized = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid SOL amount");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const padded = `${fraction}${"0".repeat(9)}`.slice(0, 9);
  return BigInt(`${whole}${padded}`).toString();
}

export function selectOfflineSettlementTier(input: {
  amountSol: number | string;
  fastLimitLamports?: number | string;
  verifiedMinLamports?: number | string;
}): OfflineSettlementTierDecision {
  const amountLamports = BigInt(solAmountToLamportsString(input.amountSol));
  const fastLimitLamports = BigInt(input.fastLimitLamports ?? DEFAULT_FAST_OFFLINE_TRUSTED_LIMIT_LAMPORTS);
  const verifiedMinLamports = BigInt(input.verifiedMinLamports ?? DEFAULT_VERIFIED_OFFLINE_MIN_LAMPORTS);

  if (amountLamports <= fastLimitLamports) {
    return {
      amountLamports: amountLamports.toString(),
      settlementMode: OFFLINE_SETTLEMENT_MODE_FAST,
      offlineSettlementTier: "fast_offline",
      receiptMaterializationRequired: false,
    };
  }

  if (amountLamports < verifiedMinLamports) {
    throw new Error("SOL amount falls between fast and verified offline limits");
  }

  return {
    amountLamports: amountLamports.toString(),
    settlementMode: OFFLINE_SETTLEMENT_MODE_VERIFIED,
    offlineSettlementTier: "verified_offline",
    receiptMaterializationRequired: true,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function evaluateDeviceIntegrity(manifest: DeviceManifest): DeviceIntegrityDecision {
  const reasons: string[] = [];
  let score =
    typeof manifest.deviceIntegrityScore === "number"
      ? manifest.deviceIntegrityScore
      : manifest.integrityLevel === "strongbox"
        ? 90
        : manifest.integrityLevel === "tee"
          ? 75
          : 45;

  if (manifest.attestationValid) {
    score += 8;
  } else {
    score -= 20;
    reasons.push("attestation unavailable or invalid");
  }

  if (manifest.isHardwareBacked || manifest.keySecurityLevel === "strongbox" || manifest.keySecurityLevel === "tee") {
    score += 6;
  } else if (manifest.integrityLevel === "software") {
    score -= 10;
    reasons.push("software-only key storage");
  }

  for (const warning of manifest.integrityWarnings ?? []) {
    const normalized = warning.toLowerCase();
    if (normalized.includes("signature") || normalized.includes("tamper") || normalized.includes("frida")) {
      score -= 45;
      reasons.push(warning);
    } else if (normalized.includes("root") || normalized.includes("magisk")) {
      score -= 30;
      reasons.push(warning);
    } else if (normalized.includes("debug") || normalized.includes("emulator")) {
      score -= 15;
      reasons.push(warning);
    }
  }

  score = clamp(Math.round(score), 0, 100);

  const state: DeviceIntegrityState =
    manifest.deviceIntegrityState ??
    ((manifest.integrityWarnings ?? []).some((warning) =>
      /signature|tamper|frida/i.test(warning),
    )
      ? "tampered"
      : (manifest.integrityWarnings ?? []).some((warning) => /root|magisk/i.test(warning))
        ? "rooted"
        : score >= 80
          ? "verified"
          : score >= 45
            ? "degraded"
            : "unknown");

  if (state === "tampered") {
    return {
      score,
      state,
      exposureMultiplier: 0,
      verifiedOnly: true,
      reasons: [...new Set([...reasons, "tampered client requires verified-only mode"])],
    };
  }

  const exposureMultiplier =
    state === "verified"
      ? 1
      : state === "degraded"
        ? 0.5
        : state === "rooted"
          ? 0.2
          : score >= 65
            ? 0.5
            : 0.2;

  return {
    score,
    state,
    exposureMultiplier,
    verifiedOnly: false,
    reasons,
  };
}

export function getDeviceAdjustedOfflineAmountLimit(policy: AllowlistPolicy, manifest: DeviceManifest): number {
  const integrity = evaluateDeviceIntegrity(manifest);
  const reputationMultiplier = computeReputationExposureMultiplier(manifest.reputationEnvelope);
  return Math.max(0, policy.maxOfflineAmount * integrity.exposureMultiplier * reputationMultiplier);
}

export function buildPolicySnapshotSignatureDigest(
  snapshot: Omit<PolicySnapshot, "signatureDigest">,
): string {
  return sha256Hex({
    domain: "airpay:policy-snapshot:v1",
    authority: snapshot.authority,
    epoch: snapshot.epoch,
    expiresAt: snapshot.expiresAt,
    issuedAt: snapshot.issuedAt,
    riskVersion: snapshot.riskVersion,
    rootHash: snapshot.rootHash,
  });
}

export function verifyPolicySnapshot(
  snapshot: PolicySnapshot,
  options: {
    now?: string;
    minRiskVersion?: number;
    expectedAuthority?: string;
    expectedRootHash?: string;
  } = {},
): CompatibilityResult {
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const reasons: string[] = [];

  if (new Date(snapshot.expiresAt).getTime() <= now) {
    reasons.push("policy snapshot expired");
  }
  if (new Date(snapshot.issuedAt).getTime() > now + 5 * 60 * 1000) {
    reasons.push("policy snapshot issued in the future");
  }
  if (options.minRiskVersion !== undefined && snapshot.riskVersion < options.minRiskVersion) {
    reasons.push("policy snapshot risk version below minimum");
  }
  if (options.expectedAuthority && snapshot.authority !== options.expectedAuthority) {
    reasons.push("policy snapshot authority mismatch");
  }
  if (options.expectedRootHash && snapshot.rootHash !== options.expectedRootHash) {
    reasons.push("policy snapshot root mismatch");
  }

  const expectedDigest = buildPolicySnapshotSignatureDigest({
    epoch: snapshot.epoch,
    issuedAt: snapshot.issuedAt,
    expiresAt: snapshot.expiresAt,
    rootHash: snapshot.rootHash,
    riskVersion: snapshot.riskVersion,
    authority: snapshot.authority,
  });
  if (snapshot.signatureDigest !== expectedDigest) {
    reasons.push("policy snapshot signature digest mismatch");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function validateManifestAgainstPolicy(
  manifest: DeviceManifest,
  policy: AllowlistPolicy,
  peerManifest?: DeviceManifest,
): CompatibilityResult {
  const reasons: string[] = [];

  if (manifest.epoch < policy.minEpoch) {
    reasons.push("local epoch below minimum policy epoch");
  }

  if (!policy.allowedStateRoots.includes(manifest.stateRoot)) {
    reasons.push("local state root not allowlisted");
  }

  if (policy.revokedStateRoots.includes(manifest.stateRoot)) {
    reasons.push("local state root revoked");
  }

  if (new Date(policy.expiresAt).getTime() <= Date.now()) {
    reasons.push("policy expired");
  }

  if (peerManifest) {
    if (peerManifest.epoch < policy.minEpoch) {
      reasons.push("peer epoch below minimum policy epoch");
    }

    if (!policy.allowedStateRoots.includes(peerManifest.stateRoot)) {
      reasons.push("peer state root not allowlisted");
    }

    if (peerManifest.appVersion > manifest.appVersion) {
      reasons.push("local app older than peer app");
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function canApproveOfflineTransfer(context: ApprovalContext): CompatibilityResult {
  const reasons: string[] = [];
  const allowance = context.allowance ?? context.budget;

  if (!allowance) {
    return {
      ok: false,
      reasons: ["offline allowance missing"],
    };
  }

  if (context.amount > allowance.remainingAmount) {
    reasons.push("offline budget exhausted");
  }

  if (allowance.remainingTransfers <= 0 || context.pendingTransfers >= context.policy.maxOfflineTransfers) {
    reasons.push("offline transfer quota exhausted");
  }

  if (context.amount > context.policy.maxOfflineAmount) {
    reasons.push("transfer exceeds policy amount ceiling");
  }

  const integrity = evaluateDeviceIntegrity(context.manifest);
  const deviceAdjustedLimit = getDeviceAdjustedOfflineAmountLimit(context.policy, context.manifest);
  if (integrity.verifiedOnly) {
    if (context.offlineSettlementTier !== "verified_offline") {
      reasons.push("device integrity requires verified-only settlement");
    }
  } else if (context.manifest.reputationEnvelope && lineageRequiresVerifiedOnly(context.manifest.reputationEnvelope)) {
    if (context.offlineSettlementTier !== "verified_offline") {
      reasons.push("reputation lineage requires verified-only settlement");
    }
  } else if (context.amount > deviceAdjustedLimit) {
    reasons.push(`device and lineage policy limits offline exposure to ${deviceAdjustedLimit.toFixed(6)} SOL`);
  }

  if (context.manifest.reputationEnvelope) {
    const reputationMultiplier = computeReputationExposureMultiplier(context.manifest.reputationEnvelope);
    if (reputationMultiplier < 1 && !lineageRequiresVerifiedOnly(context.manifest.reputationEnvelope)) {
      reasons.push(`reputation lineage multiplier ${reputationMultiplier.toFixed(2)}x applied`);
    }
  }

  // Demo builds degrade the ceiling in software-only mode instead of hard-blocking every transfer.
  if (
    !context.manifest.attestationValid &&
    context.manifest.integrityLevel === "software" &&
    context.amount > Math.min(20, context.policy.maxOfflineAmount)
  ) {
    reasons.push("software-only mode limited to low-value transfers until attestation is available");
  }

  if (context.risk.band === "blocked") {
    reasons.push("risk engine blocked the transfer");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
