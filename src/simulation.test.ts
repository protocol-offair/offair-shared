import { describe, expect, it } from "vitest";

import {
  appendReceipt,
  buildBaseRoot,
  buildHandshakeEnvelope,
  buildPeerProofDigest,
  buildPolicySnapshotSignatureDigest,
  canApproveOfflineTransfer,
  consumeOffAirAllowance,
  createOfflineTransfer,
  evaluateDeviceIntegrity,
  selectExactFundingUnits,
  validateJournal,
  validateManifestAgainstPolicy,
  verifyPolicySnapshot,
} from "./index";
import type {
  AllowlistPolicy,
  DeviceManifest,
  OffAirAllowance,
  OffAirFundingUnit,
  OfflineBudget,
  OfflineTransfer,
  OfflineVoucher,
  RiskSnapshot,
  TransferReceipt,
} from "./types";

function createManifest(deviceId: string, integrityLevel: DeviceManifest["integrityLevel"] = "tee"): DeviceManifest {
  return {
    deviceId,
    appVersion: "0.1.0",
    epoch: 3,
    stateRoot: "state-demo-v1",
    policyHash: "policy-3",
    integrityLevel,
    attestationValid: integrityLevel !== "software",
    lastOnlineAt: "2026-04-11T10:00:00.000Z",
    capabilities: ["nfc", "ble", "attestation"],
    bleServiceId: "airpay-ble-service",
    transportCapabilities: {
      nfc: true,
      bleCentral: true,
      blePeripheral: true,
      attestation: integrityLevel !== "software",
      hce: true,
    },
  };
}

function createPolicy(): AllowlistPolicy {
  return {
    policyId: "policy-3",
    policyHash: "policy-3",
    minEpoch: 3,
    allowedStateRoots: ["state-demo-v1"],
    revokedStateRoots: [],
    maxOfflineTransfers: 5,
    maxOfflineAmount: 100,
    allowBleFallback: true,
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

function createAllowance(deviceId: string): OffAirAllowance {
  return {
    budgetId: `budget-${deviceId}`,
    deviceId,
    assetId: "SOL",
    totalAmount: 100,
    remainingAmount: 100,
    remainingTransfers: 5,
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

function createLegacyBudget(deviceId: string): OfflineBudget {
  return createAllowance(deviceId);
}

function createUnitFunding(deviceId: string, count: number): OffAirFundingUnit[] {
  return Array.from({ length: count }, (_, index) => ({
    unitId: `${deviceId}-unit-${index + 1}`,
    ownerDeviceId: deviceId,
    amount: 1,
    assetId: "SOL",
    epoch: 3,
    expiresAt: "2030-01-01T00:00:00.000Z",
    issuerProof: `${deviceId}-proof-${index + 1}`,
    status: "issued",
  }));
}

function toLegacyVouchers(fundingUnits: OffAirFundingUnit[]): OfflineVoucher[] {
  return fundingUnits.map((unit) => ({
    voucherId: unit.unitId,
    ownerDeviceId: unit.ownerDeviceId,
    amount: unit.amount,
    assetId: unit.assetId,
    epoch: unit.epoch,
    expiresAt: unit.expiresAt,
    issuerSignature: unit.issuerProof,
    status: unit.status,
  }));
}

const lowRisk: RiskSnapshot = {
  score: 0.12,
  band: "low",
  reasons: ["baseline acceptable"],
  computedAt: "2026-04-11T10:00:00.000Z",
};

describe("offline protocol simulation", () => {
  it("simulates a complete sender-receiver OffAir transfer with receipt and valid journals", () => {
    const senderManifest = createManifest("device-sender");
    const receiverManifest = createManifest("device-receiver");
    const policy = createPolicy();
    const senderAllowance = createAllowance(senderManifest.deviceId);
    const senderFundingUnits = createUnitFunding(senderManifest.deviceId, 100);
    const receiverJournal: OfflineTransfer[] = [];
    const senderJournal: OfflineTransfer[] = [];

    expect(validateManifestAgainstPolicy(senderManifest, policy, receiverManifest)).toEqual({
      ok: true,
      reasons: [],
    });

    const approval = canApproveOfflineTransfer({
      allowance: senderAllowance,
      policy,
      manifest: senderManifest,
      amount: 20,
      pendingTransfers: 0,
      risk: lowRisk,
    });
    expect(approval.ok).toBe(true);

    const senderBaseRoot = buildBaseRoot({
      fundingUnits: senderFundingUnits,
      journal: senderJournal,
      remainingAmount: senderAllowance.remainingAmount,
      remainingTransfers: senderAllowance.remainingTransfers,
    });
    const receiverBaseRoot = buildBaseRoot({
      fundingUnits: [],
      journal: receiverJournal,
      remainingAmount: 0,
      remainingTransfers: 0,
    });

    const senderHandshake = buildHandshakeEnvelope({
      manifest: senderManifest,
      baseRoot: senderBaseRoot,
      counter: 1,
    });
    const receiverHandshake = buildHandshakeEnvelope({
      manifest: receiverManifest,
      baseRoot: receiverBaseRoot,
      counter: 1,
    });

    const selected = selectExactFundingUnits(senderFundingUnits, 20);
    expect(selected).toHaveLength(20);

    const senderTransferDraft = createOfflineTransfer({
      sessionId: senderHandshake.sessionId,
      senderPseudoId: senderManifest.deviceId,
      receiverPseudoId: receiverManifest.deviceId,
      amount: 20,
      fundingUnits: selected,
      existingJournal: senderJournal,
      epoch: senderManifest.epoch,
      policyHash: senderManifest.policyHash,
      risk: lowRisk,
      peerProof: buildPeerProofDigest(receiverHandshake),
    });

    const receipt: TransferReceipt = {
      receiptId: "receipt-sim-1",
      transferId: senderTransferDraft.localTxId,
      receiverPrevTxHash: "GENESIS",
      ackSignature: "receiver-ack-signature",
      receivedAt: "2026-04-11T10:01:00.000Z",
      sessionId: senderTransferDraft.sessionId,
    };

    const senderTransfer = appendReceipt(senderTransferDraft, receipt);
    const receiverTransfer = appendReceipt(
      createOfflineTransfer({
        sessionId: receiverHandshake.sessionId,
        senderPseudoId: senderManifest.deviceId,
        receiverPseudoId: receiverManifest.deviceId,
        amount: 20,
        fundingUnits: selected,
        existingJournal: receiverJournal,
        epoch: receiverManifest.epoch,
        policyHash: receiverManifest.policyHash,
        risk: lowRisk,
        peerProof: buildPeerProofDigest(senderHandshake),
      }),
      receipt,
    );

    senderJournal.push(senderTransfer);
    receiverJournal.push(receiverTransfer);

    expect(validateJournal(senderJournal)).toMatchObject({ ok: true });
    expect(validateJournal(receiverJournal)).toMatchObject({ ok: true });

    const consumedAllowance = consumeOffAirAllowance(senderAllowance, 20);
    expect(consumedAllowance.remainingAmount).toBe(80);
    expect(consumedAllowance.remainingTransfers).toBe(4);
  });

  it("keeps the legacy voucher shape valid while the app transitions", () => {
    const legacyVouchers = toLegacyVouchers(createUnitFunding("device-legacy", 5));
    const selected = selectExactFundingUnits(legacyVouchers, 3);

    expect(selected).toHaveLength(3);
    expect(selected[0]).toHaveProperty("voucherId");
  });

  it("detects journal tampering after receipt exchange", () => {
    const manifest = createManifest("device-a");
    const peerManifest = createManifest("device-b");
    const fundingUnits = createUnitFunding("device-a", 5);
    const baseRoot = buildBaseRoot({
      fundingUnits,
      journal: [],
      remainingAmount: 5,
      remainingTransfers: 1,
    });
    const transfer = appendReceipt(
      createOfflineTransfer({
        sessionId: "session-sim-2",
        senderPseudoId: manifest.deviceId,
        receiverPseudoId: peerManifest.deviceId,
        amount: 5,
        fundingUnits,
        existingJournal: [],
        epoch: manifest.epoch,
        policyHash: manifest.policyHash,
        risk: lowRisk,
        peerProof: buildPeerProofDigest(
          buildHandshakeEnvelope({
            manifest: peerManifest,
            baseRoot,
            counter: 1,
          }),
        ),
      }),
      {
        receiptId: "receipt-sim-2",
        transferId: "transfer-sim-2",
        receiverPrevTxHash: "GENESIS",
        ackSignature: "ack-sim-2",
        receivedAt: "2026-04-11T10:02:00.000Z",
        sessionId: "session-sim-2",
      },
    );

    const journal = [transfer];
    expect(validateJournal(journal)).toMatchObject({ ok: true });

    journal[0] = {
      ...journal[0],
      amount: 4,
    };
    const tampered = validateJournal(journal);
    expect(tampered.ok).toBe(false);
    expect(tampered.issues).toContain("tampered tx hash at index 0");
  });

  it("degrades software-only devices to low-value transfers", () => {
    const policy = createPolicy();
    const softwareManifest = createManifest("device-soft", "software");
    const approval = canApproveOfflineTransfer({
      budget: createLegacyBudget("device-soft"),
      policy,
      manifest: softwareManifest,
      amount: 25,
      pendingTransfers: 0,
      risk: lowRisk,
    });

    expect(approval.ok).toBe(false);
    expect(approval.reasons).toContain("software-only mode limited to low-value transfers until attestation is available");
  });

  it("forces tampered devices into verified-only settlement", () => {
    const policy = createPolicy();
    const manifest = {
      ...createManifest("device-tampered", "tee"),
      deviceIntegrityState: "tampered" as const,
      integrityWarnings: ["signature mismatch"],
    };
    const integrity = evaluateDeviceIntegrity(manifest);
    const approval = canApproveOfflineTransfer({
      budget: createLegacyBudget("device-tampered"),
      policy,
      manifest,
      amount: 1,
      pendingTransfers: 0,
      risk: lowRisk,
    });

    expect(integrity.verifiedOnly).toBe(true);
    expect(approval.ok).toBe(false);
    expect(approval.reasons).toContain("device integrity requires verified-only settlement");

    const verifiedApproval = canApproveOfflineTransfer({
      budget: createLegacyBudget("device-tampered"),
      policy,
      manifest,
      amount: 1,
      offlineSettlementTier: "verified_offline",
      pendingTransfers: 0,
      risk: lowRisk,
    });
    expect(verifiedApproval.ok).toBe(true);
  });

  it("inherits reputation lineage risk into offline approval", () => {
    const policy = createPolicy();
    const manifest = {
      ...createManifest("device-lineage", "tee"),
      reputationEnvelope: {
        trustCeiling: 25,
        riskFloor: 70,
        cooldownUntil: "2026-04-12T10:00:00.000Z",
        lineageGeneration: 4,
        resetCount: 3,
        unresolvedExposure: 0.2,
        mode: "restricted" as const,
        updatedAt: "2026-04-11T10:00:00.000Z",
        reasons: ["wallet recreation inherits device reputation limits"],
      },
    };
    const approval = canApproveOfflineTransfer({
      budget: createLegacyBudget("device-lineage"),
      policy,
      manifest,
      amount: 50,
      pendingTransfers: 0,
      risk: lowRisk,
    });

    expect(approval.ok).toBe(false);
    expect(approval.reasons.some((reason) => reason.includes("reputation lineage multiplier"))).toBe(true);
  });

  it("verifies policy snapshot freshness, authority, and digest provenance", () => {
    const unsignedSnapshot = {
      epoch: 3,
      issuedAt: "2026-04-11T10:00:00.000Z",
      expiresAt: "2026-04-11T10:15:00.000Z",
      rootHash: "policy-root-v1",
      riskVersion: 1,
      authority: "airpay-protocol-authority",
    };
    const snapshot = {
      ...unsignedSnapshot,
      signatureDigest: buildPolicySnapshotSignatureDigest(unsignedSnapshot),
    };

    expect(
      verifyPolicySnapshot(snapshot, {
        now: "2026-04-11T10:05:00.000Z",
        minRiskVersion: 1,
        expectedAuthority: "airpay-protocol-authority",
        expectedRootHash: "policy-root-v1",
      }).ok,
    ).toBe(true);

    expect(
      verifyPolicySnapshot(
        {
          ...snapshot,
          rootHash: "tampered-root",
        },
        {
          now: "2026-04-11T10:05:00.000Z",
          expectedRootHash: "policy-root-v1",
        },
      ).ok,
    ).toBe(false);
  });
});
