import { describe, expect, it } from "vitest";

import { appendReceipt, createOfflineTransfer, selectExactFundingUnits, selectExactVouchers, validateJournal } from "./journal";
import { selectOfflineSettlementTier } from "./policy";
import { RECEIVER_PAYS_OFFLINE_SETTLEMENT_FEES } from "./types";
import type { OffAirFundingUnit, OfflineVoucher, PeerProofDigest, RiskSnapshot, TransferReceipt } from "./types";

const fundingUnits: OffAirFundingUnit[] = [
  {
    unitId: "unit-50",
    ownerDeviceId: "device-a",
    amount: 50,
    assetId: "SOL",
    epoch: 3,
    expiresAt: "2030-01-01T00:00:00.000Z",
    issuerProof: "sig-50",
    status: "issued",
  },
  {
    unitId: "unit-20",
    ownerDeviceId: "device-a",
    amount: 20,
    assetId: "SOL",
    epoch: 3,
    expiresAt: "2030-01-01T00:00:00.000Z",
    issuerProof: "sig-20",
    status: "issued",
  },
  {
    unitId: "unit-10",
    ownerDeviceId: "device-a",
    amount: 10,
    assetId: "SOL",
    epoch: 3,
    expiresAt: "2030-01-01T00:00:00.000Z",
    issuerProof: "sig-10",
    status: "issued",
  },
];

const legacyVouchers: OfflineVoucher[] = fundingUnits.map((unit) => ({
  ownerDeviceId: unit.ownerDeviceId,
  amount: unit.amount,
  assetId: unit.assetId,
  epoch: unit.epoch,
  expiresAt: unit.expiresAt,
  status: unit.status,
  voucherId: unit.unitId,
  issuerSignature: unit.issuerProof,
}));

const peerProof: PeerProofDigest = {
  deviceId: "device-b",
  stateRoot: "state-root",
  baseRoot: "base-root",
  counter: 1,
  nonce: "nonce-1",
  lastOnlineAt: "2026-04-10T10:00:00.000Z",
  signature: "peer-signature",
};

const risk: RiskSnapshot = {
  score: 0.2,
  band: "low",
  reasons: ["baseline acceptable"],
  computedAt: "2026-04-10T10:00:00.000Z",
};

describe("shared journal helpers", () => {
  it("selects an exact OffAir funding bundle", () => {
    const selection = selectExactFundingUnits(fundingUnits, 70);
    expect(selection.map((unit) => unit.unitId)).toEqual(["unit-50", "unit-20"]);
  });

  it("finds an exact bundle even when greedy selection would fail", () => {
    const fragmented: OffAirFundingUnit[] = [
      { ...fundingUnits[2], unitId: "unit-5", amount: 5 },
      { ...fundingUnits[2], unitId: "unit-2a", amount: 2 },
      { ...fundingUnits[2], unitId: "unit-2b", amount: 2 },
      { ...fundingUnits[2], unitId: "unit-2c", amount: 2 },
    ];

    const selection = selectExactFundingUnits(fragmented, 6);
    expect(selection.map((unit) => unit.unitId)).toEqual(["unit-2a", "unit-2b", "unit-2c"]);
  });

  it("keeps the legacy voucher selector working during the transition", () => {
    const selection = selectExactVouchers(legacyVouchers, 70);
    expect(selection.map((voucher) => voucher.voucherId)).toEqual(["unit-50", "unit-20"]);
  });

  it("seals receiver-paid settlement fees into new offline transfers", () => {
    const transfer = createOfflineTransfer({
      senderPseudoId: "sender-1",
      receiverPseudoId: "receiver-1",
      amount: 50,
      fundingUnits: [fundingUnits[0]],
      existingJournal: [],
      epoch: 3,
      policyHash: "policy-3",
      risk,
      peerProof,
    });

    expect(transfer.settlementFeePolicy).toEqual(RECEIVER_PAYS_OFFLINE_SETTLEMENT_FEES);
    expect(validateJournal([transfer]).ok).toBe(true);

    const tampered = {
      ...transfer,
      settlementFeePolicy: {
        ...RECEIVER_PAYS_OFFLINE_SETTLEMENT_FEES,
        airPayPaysNetworkFees: true,
      },
    } as unknown as typeof transfer;

    expect(validateJournal([tampered]).issues).toContain("tampered tx hash at index 0");
  });

  it("selects fast and verified offline tiers in SOL lamports", () => {
    const fast = selectOfflineSettlementTier({ amountSol: "0.2" });
    const verified = selectOfflineSettlementTier({ amountSol: "0.25" });

    expect(fast).toMatchObject({
      amountLamports: "200000000",
      settlementMode: 1,
      offlineSettlementTier: "fast_offline",
      receiptMaterializationRequired: false,
    });
    expect(verified).toMatchObject({
      amountLamports: "250000000",
      settlementMode: 2,
      offlineSettlementTier: "verified_offline",
      receiptMaterializationRequired: true,
    });
  });

  it("detects journal tampering", () => {
    const first = createOfflineTransfer({
      senderPseudoId: "sender-1",
      receiverPseudoId: "receiver-1",
      amount: 50,
      fundingUnits: [fundingUnits[0]],
      existingJournal: [],
      epoch: 3,
      policyHash: "policy-3",
      risk,
      peerProof,
    });

    const receipt: TransferReceipt = {
      receiptId: "receipt-1",
      transferId: first.localTxId,
      receiverPrevTxHash: "GENESIS",
      ackSignature: "ack-1",
      receivedAt: "2026-04-10T10:01:00.000Z",
      sessionId: first.sessionId,
    };

    const second = appendReceipt(first, receipt);
    const journal = [second];
    const valid = validateJournal(journal);
    expect(valid.ok).toBe(true);

    journal[0] = {
      ...journal[0],
      amount: 40,
    };

    const tampered = validateJournal(journal);
    expect(tampered.ok).toBe(false);
    expect(tampered.issues).toContain("tampered tx hash at index 0");
  });
});
