import { describe, expect, it } from "vitest";

import {
  buildDeviceReputationAnchor,
  IDENTITY_DERIVATION_VERSION,
  buildIdentityContextHash,
  buildIdentityDerivationMaterial,
  buildReputationEnvelope,
  computeReputationExposureMultiplier,
  lineageRequiresVerifiedOnly,
} from "./identity";

describe("identity derivation", () => {
  it("normalizes global wallet material deterministically", () => {
    const left = buildIdentityDerivationMaterial({
      walletType: "global",
      displayName: "Árthur Wallet",
    });
    const right = buildIdentityDerivationMaterial({
      walletType: "global",
      displayName: "ARTHUR   WALLET",
    });

    expect(left).toEqual(right);
    expect(left.version).toBe(IDENTITY_DERIVATION_VERSION);
    expect(left.displayName).toBe("ARTHUR WALLET");
  });

  it("ignores display formatting changes and deprecated civil remnants in the identity hash", () => {
    const left = buildIdentityContextHash({
      walletType: "global",
      displayName: "AirPay Wallet",
      documentType: "cpf",
      documentId: "123.456.789-01",
      birthDate: "1990-01-01",
    });
    const right = buildIdentityContextHash({
      walletType: "global",
      displayName: "AIRPAY WALLET",
      documentType: "cnpj",
      documentId: "12345678000199",
      businessName: "LEGACY BUSINESS",
      responsibleName: "Maria Silva",
      responsibleDocumentId: "12345678901",
    });

    expect(left).toBe(right);
  });

  it("changes the hash when the stable identity material changes", () => {
    const left = buildIdentityContextHash({
      walletType: "global",
      displayName: "Arthur Wallet",
    });
    const right = buildIdentityContextHash({
      walletType: "global",
      displayName: "Arthur Wallet Recovery",
    });

    expect(left).not.toBe(right);
  });

  it("derives an irreversible device reputation anchor without exposing raw signals", () => {
    const anchor = buildDeviceReputationAnchor({
      normalizedSignals: {
        appId: "com.airpay.wallet",
        keySecurityLevel: "tee",
        nativeDeviceHash: "device-hash",
      },
      installationSalt: "local-installation-salt",
      policyHash: "policy-hash",
      epoch: 3,
      derivedAt: "2026-05-16T10:00:00.000Z",
    });

    expect(anchor.anchorHash).toHaveLength(128);
    expect(anchor.signalHash).toHaveLength(128);
    expect(anchor.anchorHash).not.toContain("device-hash");
    expect(anchor.anchorHash).not.toContain("local-installation-salt");
  });

  it("applies wallet lineage cooldowns and verified-only mode after risky resets", () => {
    const first = buildReputationEnvelope({
      existingWalletCount: 0,
      now: "2026-05-16T10:00:00.000Z",
    });
    const reset = buildReputationEnvelope({
      previousEnvelope: first,
      existingWalletCount: 2,
      unresolvedExposure: 0.5,
      integrityState: "tampered",
      now: "2026-05-16T11:00:00.000Z",
    });

    expect(first.mode).toBe("new");
    expect(reset.mode).toBe("verified_only");
    expect(reset.trustCeiling).toBe(0);
    expect(reset.riskFloor).toBeGreaterThanOrEqual(90);
    expect(lineageRequiresVerifiedOnly(reset)).toBe(true);
    expect(computeReputationExposureMultiplier(reset, "2026-05-16T12:00:00.000Z")).toBe(0);
  });
});
