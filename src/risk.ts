import type { RiskBand, RiskSnapshot } from "./types.js";

export interface RiskFeatures {
  daysOffline: number;
  pendingTransfers: number;
  aggregatePendingAmount: number;
  journalGapCount: number;
  inconsistentHistoryCount: number;
  attestationValid: boolean;
}

export function riskBandForScore(score: number): RiskBand {
  if (score >= 0.85) {
    return "blocked";
  }

  if (score >= 0.65) {
    return "high";
  }

  if (score >= 0.35) {
    return "medium";
  }

  return "low";
}

export function scoreRisk(features: RiskFeatures): RiskSnapshot {
  const rawScore =
    features.daysOffline * 0.025 +
    features.pendingTransfers * 0.05 +
    features.aggregatePendingAmount * 0.0025 +
    features.journalGapCount * 0.2 +
    features.inconsistentHistoryCount * 0.3 +
    (features.attestationValid ? 0 : 0.2);

  const score = Number(Math.min(1, rawScore).toFixed(4));
  const reasons: string[] = [];

  if (features.daysOffline > 3) {
    reasons.push("device offline for more than 72h");
  }
  if (features.pendingTransfers > 2) {
    reasons.push("too many pending transfers");
  }
  if (features.aggregatePendingAmount > 100) {
    reasons.push("pending value is high");
  }
  if (features.journalGapCount > 0) {
    reasons.push("journal chain contains a gap");
  }
  if (features.inconsistentHistoryCount > 0) {
    reasons.push("history contains reconciliation inconsistencies");
  }
  if (!features.attestationValid) {
    reasons.push("device attestation is not valid");
  }

  return {
    score,
    band: riskBandForScore(score),
    reasons: reasons.length > 0 ? reasons : ["risk baseline acceptable"],
    computedAt: new Date().toISOString(),
  };
}

