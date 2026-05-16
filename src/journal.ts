import { canonicalStringify, createNonce, deriveSessionKey, sha256Hex } from "./crypto.js";
import { selectOfflineSettlementTier } from "./policy.js";
import { RECEIVER_PAYS_OFFLINE_SETTLEMENT_FEES } from "./types.js";
import type {
  HandshakeEnvelope,
  OffAirAllowance,
  OffAirFundingUnit,
  OfflineSettlementFeePolicy,
  OfflineSettlementTier,
  OfflineTransfer,
  OfflineVoucher,
  PeerProofDigest,
  PromiseSignatureBundle,
  RiskSnapshot,
  SessionSettlementMode,
  TransferReceipt,
  WalletType,
} from "./types.js";

export interface CreateTransferParams {
  sessionId?: string;
  senderPseudoId: string;
  receiverPseudoId: string;
  senderAddress?: string;
  receiverAddress?: string;
  amount: number;
  fundingUnits?: Array<OffAirFundingUnit | OfflineVoucher>;
  /** @deprecated Use fundingUnits. */
  vouchers?: OfflineVoucher[];
  assetId?: string;
  existingJournal: OfflineTransfer[];
  epoch: number;
  policyHash: string;
  risk: RiskSnapshot;
  peerProof: PeerProofDigest;
  walletId?: string;
  walletType?: WalletType;
  sessionSettlementMode?: SessionSettlementMode;
  offlineSettlementTier?: OfflineSettlementTier;
  receiptMaterializationRequired?: boolean;
  settlementFeePolicy?: OfflineSettlementFeePolicy;
  signatureBundle?: PromiseSignatureBundle;
  sessionNonce?: string;
  peerNonce?: string;
  timestampWindowSeconds?: number;
}

function normalizeFundingUnit(unit: OffAirFundingUnit | OfflineVoucher): OffAirFundingUnit {
  const isLegacyVoucher = "voucherId" in unit;

  return {
    unitId: !isLegacyVoucher ? unit.unitId : unit.unitId ?? unit.voucherId,
    ownerDeviceId: unit.ownerDeviceId,
    amount: unit.amount,
    assetId: unit.assetId,
    epoch: unit.epoch,
    expiresAt: unit.expiresAt,
    issuerProof: !isLegacyVoucher ? unit.issuerProof : unit.issuerProof ?? unit.issuerSignature,
    status: unit.status,
  };
}

export function buildBaseRoot(input: {
  fundingUnits?: Array<OffAirFundingUnit | OfflineVoucher>;
  /** @deprecated Use fundingUnits. */
  vouchers?: OfflineVoucher[];
  journal: OfflineTransfer[];
  remainingAmount?: number;
  remainingTransfers?: number;
}): string {
  const fundingUnits = (input.fundingUnits ?? input.vouchers ?? []).map(normalizeFundingUnit);
  return sha256Hex({
    fundingUnits,
    journal: input.journal,
    remainingAmount: input.remainingAmount ?? 0,
    remainingTransfers: input.remainingTransfers ?? 0,
  });
}

export function buildHandshakeEnvelope(input: {
  manifest: HandshakeEnvelope["manifest"];
  baseRoot: string;
  counter: number;
  walletId?: string;
  walletType?: WalletType;
  signatureBundle?: PromiseSignatureBundle;
}): HandshakeEnvelope {
  const nonce = createNonce("nonce");

  return {
    sessionId: createNonce("session"),
    manifest: input.manifest,
    baseRoot: input.baseRoot,
    nonce,
    counter: input.counter,
    walletId: input.walletId,
    walletType: input.walletType,
    signatureBundle: input.signatureBundle,
    signature: sha256Hex({
      manifest: input.manifest,
      baseRoot: input.baseRoot,
      nonce,
      counter: input.counter,
      walletId: input.walletId,
      walletType: input.walletType,
      signatureBundle: input.signatureBundle,
    }),
  };
}

export function buildPeerProofDigest(envelope: HandshakeEnvelope): PeerProofDigest {
  return {
    deviceId: envelope.manifest.deviceId,
    stateRoot: envelope.manifest.stateRoot,
    baseRoot: envelope.baseRoot,
    counter: envelope.counter,
    nonce: envelope.nonce,
    lastOnlineAt: envelope.manifest.lastOnlineAt,
    signature: envelope.signature,
  };
}

export function selectExactFundingUnits<T extends OffAirFundingUnit | OfflineVoucher>(fundingUnits: T[], amount: number): T[] {
  const sorted = [...fundingUnits]
    .filter((unit) => normalizeFundingUnit(unit).status === "issued")
    .sort((left, right) => right.amount - left.amount);

  const bestByAmount = Array<T[] | undefined>(amount + 1).fill(undefined);
  bestByAmount[0] = [];

  for (const unit of sorted) {
    for (let currentAmount = amount; currentAmount >= unit.amount; currentAmount -= 1) {
      const previousSelection = bestByAmount[currentAmount - unit.amount];
      if (!previousSelection) {
        continue;
      }

      const candidate = [...previousSelection, unit];
      const existing = bestByAmount[currentAmount];

      if (!existing || candidate.length < existing.length) {
        bestByAmount[currentAmount] = candidate;
      }
    }
  }

  const chosen = bestByAmount[amount];
  if (!chosen) {
    throw new Error(`Unable to build an exact funding bundle for amount ${amount}`);
  }

  return chosen;
}

/** @deprecated Use selectExactFundingUnits. */
export function selectExactVouchers(vouchers: OfflineVoucher[], amount: number): OfflineVoucher[] {
  return selectExactFundingUnits(vouchers, amount);
}

export function createOfflineTransfer(params: CreateTransferParams): OfflineTransfer {
  const previousTransfer = params.existingJournal.at(-1);
  const fundingUnits = (params.fundingUnits ?? params.vouchers ?? []).map(normalizeFundingUnit);
  const assetId = params.assetId ?? fundingUnits[0]?.assetId ?? "OFFAIR";
  const promiseId = createNonce("promise");
  const createdAt = new Date().toISOString();
  const sequence = (previousTransfer?.counter ?? 0) + 1;
  const sessionSettlementMode = params.sessionSettlementMode ?? "offline_promise";
  const offlineSettlement =
    sessionSettlementMode === "offline_promise" ? selectOfflineSettlementTier({ amountSol: params.amount }) : undefined;
  const basePayload = {
    localTxId: createNonce("localtx"),
    promiseId,
    sessionId: params.sessionId ?? createNonce("session"),
    senderPseudoId: params.senderPseudoId,
    receiverPseudoId: params.receiverPseudoId,
    senderAddress: params.senderAddress,
    receiverAddress: params.receiverAddress,
    walletId: params.walletId,
    walletType: params.walletType,
    assetId,
    amount: params.amount,
    voucherIds: fundingUnits.map((unit) => unit.unitId),
    prevTxHash: previousTransfer?.txHash ?? "GENESIS",
    counter: sequence,
    epoch: params.epoch,
    policyHash: params.policyHash,
    peerProofDigest: sha256Hex(params.peerProof),
    createdAt,
    encryptedPayload: deriveSessionKey({
      vouchers: fundingUnits.map((unit) => unit.unitId),
      peer: params.peerProof.deviceId,
      amount: params.amount,
      seed: createNonce("payload"),
    }),
    settlementStatus: "pending" as const,
    risk: params.risk,
    sessionSettlementMode,
    offlineSettlementTier: params.offlineSettlementTier ?? offlineSettlement?.offlineSettlementTier,
    receiptMaterializationRequired:
      params.receiptMaterializationRequired ?? offlineSettlement?.receiptMaterializationRequired,
    settlementFeePolicy: params.settlementFeePolicy ?? RECEIVER_PAYS_OFFLINE_SETTLEMENT_FEES,
    replayProtection: {
      sequence,
      sessionNonce: params.sessionNonce ?? createNonce("session_nonce"),
      peerNonce: params.peerNonce ?? params.peerProof.nonce,
      timestampWindowSeconds: params.timestampWindowSeconds ?? 15 * 60,
      createdAt,
    },
    signingAlgorithms: params.signatureBundle?.signatures.map((signature) => signature.algorithm) ?? [],
    signatureBundle: params.signatureBundle,
  };

  return {
    ...basePayload,
    txHash: sha256Hex(basePayload),
  };
}

export function appendReceipt(transfer: OfflineTransfer, receipt: TransferReceipt): OfflineTransfer {
  const { txHash: _ignored, ...rest } = transfer;
  return {
    ...rest,
    receipt,
    txHash: sha256Hex({
      ...rest,
      receipt,
    }),
  };
}

export interface JournalValidationResult {
  ok: boolean;
  issues: string[];
  root: string;
}

export function validateJournal(journal: OfflineTransfer[]): JournalValidationResult {
  const issues: string[] = [];

  journal.forEach((transfer, index) => {
    const expectedPrev = index === 0 ? "GENESIS" : journal[index - 1]?.txHash;
    const expectedCounter = index + 1;
    const recalculatedHash = sha256Hex({
      localTxId: transfer.localTxId,
      promiseId: transfer.promiseId,
      sessionId: transfer.sessionId,
      senderPseudoId: transfer.senderPseudoId,
      receiverPseudoId: transfer.receiverPseudoId,
      senderAddress: transfer.senderAddress,
      receiverAddress: transfer.receiverAddress,
      walletId: transfer.walletId,
      walletType: transfer.walletType,
      assetId: transfer.assetId,
      amount: transfer.amount,
      voucherIds: transfer.voucherIds,
      prevTxHash: transfer.prevTxHash,
      counter: transfer.counter,
      epoch: transfer.epoch,
      policyHash: transfer.policyHash,
      peerProofDigest: transfer.peerProofDigest,
      createdAt: transfer.createdAt,
      encryptedPayload: transfer.encryptedPayload,
      settlementStatus: transfer.settlementStatus,
      claimStatus: transfer.claimStatus,
      sessionSettlementMode: transfer.sessionSettlementMode,
      offlineSettlementTier: transfer.offlineSettlementTier,
      receiptMaterializationRequired: transfer.receiptMaterializationRequired,
      settlementFeePolicy: transfer.settlementFeePolicy,
      replayProtection: transfer.replayProtection,
      directSettlementSignature: transfer.directSettlementSignature,
      instantClaimSignature: transfer.instantClaimSignature,
      instantSettleSignature: transfer.instantSettleSignature,
      risk: transfer.risk,
      signingAlgorithms: transfer.signingAlgorithms,
      signatureBundle: transfer.signatureBundle,
      receipt: transfer.receipt,
    });

    if (transfer.prevTxHash !== expectedPrev) {
      issues.push(`prev hash mismatch at index ${index}`);
    }

    if (transfer.counter !== expectedCounter) {
      issues.push(`counter mismatch at index ${index}`);
    }

    if (transfer.txHash !== recalculatedHash) {
      issues.push(`tampered tx hash at index ${index}`);
    }
  });

  return {
    ok: issues.length === 0,
    issues,
    root: sha256Hex(canonicalStringify(journal.map((transfer) => transfer.txHash))),
  };
}

export function consumeOffAirAllowance(
  allowance: OffAirAllowance,
  amount: number,
  transferCount = 1,
): OffAirAllowance {
  return {
    ...allowance,
    remainingAmount: Math.max(0, allowance.remainingAmount - amount),
    remainingTransfers: Math.max(0, allowance.remainingTransfers - transferCount),
  };
}

/** @deprecated Use consumeOffAirAllowance. */
export function consumeBudget(
  budget: OffAirAllowance,
  amount: number,
  transferCount = 1,
): OffAirAllowance {
  return consumeOffAirAllowance(budget, amount, transferCount);
}
