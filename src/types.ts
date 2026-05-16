export type IntegrityLevel = "strongbox" | "tee" | "software";
export type DeviceIntegrityState = "verified" | "degraded" | "rooted" | "tampered" | "unknown";
export type ReputationLineageMode = "new" | "stable" | "cooldown" | "restricted" | "verified_only";
export type OffAirUnitStatus = "issued" | "locked" | "spent" | "reconciled";
/** @deprecated Use OffAirUnitStatus. */
export type VoucherStatus = OffAirUnitStatus;
export type RiskBand = "low" | "medium" | "high" | "blocked";
export type ChainAssetId = "OFFAIR" | "SOL" | "AIR";
export type ChainTransactionStatus = "signed" | "queued" | "submitted" | "confirmed" | "failed";
/** @deprecated "individual" and "business" are legacy compatibility values. Use "global" for new wallets. */
export type WalletType = "global" | "individual" | "business";
/** @deprecated Civil document identity is no longer part of the main protocol path. */
export type DocumentType = "cpf" | "cnpj" | "passport" | "other";
export type PromiseSignatureRole = "pq" | "device" | "wallet" | "identity" | "certificate";
export type PromiseSignatureAlgorithm =
  | "ml-dsa-65"
  | "ecdsa-p256"
  | "ed25519"
  | "x509-rsa-sha256"
  | "x509-ecdsa-sha256";
export type PromiseStatus = "draft" | "pending" | "claimed" | "settled" | "rejected_structural";
export type SessionSettlementMode = "direct_sol" | "instant_claim" | "offline_promise";
export type OfflineSettlementTier = "fast_offline" | "verified_offline";
export type OfflineRiskTier = "new" | "trusted" | "high_trust";
export type OfflineSettlementFeePayer = "receiver";
export type OfflineSettlementFeeAction = "claim" | "settle" | "receipt_materialization";

export const OFFLINE_SETTLEMENT_MODE_FAST = 1;
export const OFFLINE_SETTLEMENT_MODE_VERIFIED = 2;
export const OFFLINE_RISK_TIER_NEW = 1;
export const OFFLINE_RISK_TIER_TRUSTED = 2;
export const OFFLINE_RISK_TIER_HIGH_TRUST = 3;
export const DEFAULT_FAST_OFFLINE_NEW_USER_LIMIT_LAMPORTS = 54_000_000;
export const DEFAULT_FAST_OFFLINE_TRUSTED_LIMIT_LAMPORTS = 215_000_000;
export const DEFAULT_FAST_OFFLINE_HIGH_TRUST_LIMIT_LAMPORTS = 1_073_000_000;
export const DEFAULT_VERIFIED_OFFLINE_MIN_LAMPORTS = DEFAULT_FAST_OFFLINE_TRUSTED_LIMIT_LAMPORTS + 1;

export interface OfflineSettlementFeePolicy {
  payer: OfflineSettlementFeePayer;
  networkFeeAssetId: "SOL";
  appliesTo: OfflineSettlementFeeAction[];
  airPayPaysNetworkFees: false;
}

export const RECEIVER_PAYS_OFFLINE_SETTLEMENT_FEES: OfflineSettlementFeePolicy = {
  payer: "receiver",
  networkFeeAssetId: "SOL",
  appliesTo: ["claim", "settle", "receipt_materialization"],
  airPayPaysNetworkFees: false,
};

export interface TransportCapabilities {
  nfc: boolean;
  bleCentral: boolean;
  blePeripheral: boolean;
  attestation: boolean;
  hce: boolean;
}

export interface OptionalCertificateProfile {
  certificateId: string;
  alias: string;
  fileName?: string;
  fingerprint: string;
  subject: string;
  issuer: string;
  serialNumber?: string;
  validFrom?: string;
  validTo?: string;
  algorithm?: PromiseSignatureAlgorithm | string;
  importedAt: string;
}

export interface DeviceManifest {
  deviceId: string;
  appVersion: string;
  epoch: number;
  stateRoot: string;
  policyHash: string;
  integrityLevel: IntegrityLevel;
  attestationValid: boolean;
  lastOnlineAt: string;
  capabilities: Array<"nfc" | "ble" | "attestation">;
  keyAlias?: string;
  publicKey?: string;
  keySecurityLevel?: IntegrityLevel | "unknown";
  deviceSecurityLevel?: IntegrityLevel | "unknown";
  isHardwareBacked?: boolean;
  attestationChallenge?: string;
  attestationCertificates?: string[];
  bleServiceId?: string;
  transportCapabilities?: TransportCapabilities;
  walletPublicKey?: string;
  solanaAddress?: string;
  activeWalletId?: string;
  walletType?: WalletType;
  walletDisplayName?: string;
  rpcReachable?: boolean;
  instantClaimCapable?: boolean;
  deviceIntegrityScore?: number;
  deviceIntegrityState?: DeviceIntegrityState;
  integrityWarnings?: string[];
  deviceReputationAnchorHash?: string;
  deviceReputationAnchorEpoch?: number;
  reputationEnvelope?: ReputationEnvelope;
}

export interface PolicySnapshot {
  epoch: number;
  issuedAt: string;
  expiresAt: string;
  rootHash: string;
  riskVersion: number;
  authority: string;
  signatureDigest: string;
}

export interface DeviceReputationAnchor {
  anchorHash: string;
  signalHash: string;
  epoch: number;
  protocolSaltVersion: number;
  derivedAt: string;
}

export interface ReputationEnvelope {
  trustCeiling: number;
  riskFloor: number;
  cooldownUntil?: string | null;
  lineageGeneration: number;
  resetCount: number;
  unresolvedExposure: number;
  mode: ReputationLineageMode;
  updatedAt: string;
  reasons: string[];
}

export interface WalletLineage {
  walletId: string;
  anchorHash: string;
  generation: number;
  createdAt: string;
  previousWalletId?: string | null;
  inheritedTrustCeiling: number;
  inheritedRiskFloor: number;
  cooldownUntil?: string | null;
  unresolvedExposure: number;
}

export interface AllowlistPolicy {
  policyId: string;
  policyHash: string;
  minEpoch: number;
  allowedStateRoots: string[];
  revokedStateRoots: string[];
  maxOfflineTransfers: number;
  maxOfflineAmount: number;
  fastOfflineNewUserLimitLamports?: string;
  fastOfflineTrustedLimitLamports?: string;
  fastOfflineHighTrustLimitLamports?: string;
  verifiedOfflineMinLamports?: string;
  allowBleFallback: boolean;
  expiresAt: string;
}

export interface OffAirAllowance {
  budgetId: string;
  deviceId: string;
  assetId: string;
  totalAmount: number;
  remainingAmount: number;
  remainingTransfers: number;
  expiresAt: string;
}

/** @deprecated Use OffAirAllowance. */
export type OfflineBudget = OffAirAllowance;

export interface OffAirFundingUnit {
  unitId: string;
  ownerDeviceId: string;
  amount: number;
  assetId: string;
  epoch: number;
  expiresAt: string;
  issuerProof: string;
  status: OffAirUnitStatus;
}

/** @deprecated Use OffAirFundingUnit. */
export type OfflineVoucher = Omit<OffAirFundingUnit, "unitId" | "issuerProof"> & {
  voucherId: string;
  issuerSignature: string;
  unitId?: string;
  issuerProof?: string;
};

export interface PeerProofDigest {
  deviceId: string;
  stateRoot: string;
  baseRoot: string;
  counter: number;
  nonce: string;
  lastOnlineAt: string;
  signature: string;
}

export interface PromiseSignature {
  role: PromiseSignatureRole;
  algorithm: PromiseSignatureAlgorithm;
  signature: string;
  publicKey?: string;
  keyId?: string;
  certificateFingerprint?: string;
  metadata?: Record<string, unknown>;
}

export interface PromiseSignatureBundle {
  payloadVersion: 1 | 2 | 3;
  digest: string;
  payloadHash?: string;
  createdAt: string;
  signatures: PromiseSignature[];
  certificateProfile?: OptionalCertificateProfile;
}

export interface TransferReceipt {
  receiptId: string;
  transferId: string;
  receiverPrevTxHash: string;
  ackSignature: string;
  receivedAt: string;
  sessionId: string;
  walletId?: string;
  sessionSettlementMode?: SessionSettlementMode;
  claimStatus?: PromiseStatus;
  claimTxSignature?: string;
  settleTxSignature?: string;
  directSettlementSignature?: string;
  settlementFeePolicy?: OfflineSettlementFeePolicy;
  signatureBundle?: PromiseSignatureBundle;
}

export interface RiskSnapshot {
  score: number;
  band: RiskBand;
  reasons: string[];
  computedAt: string;
}

export interface ReplayProtectionEnvelope {
  sequence: number;
  sessionNonce: string;
  peerNonce: string;
  timestampWindowSeconds: number;
  createdAt: string;
  tombstoneHash?: string;
}

export interface OfflineTransfer {
  localTxId: string;
  promiseId?: string;
  sessionId: string;
  senderPseudoId: string;
  receiverPseudoId: string;
  senderAddress?: string;
  receiverAddress?: string;
  walletId?: string;
  walletType?: WalletType;
  assetId: string;
  amount: number;
  /** @deprecated Use funding units in higher-level APIs. Retained for current app compatibility. */
  voucherIds: string[];
  prevTxHash: string;
  counter: number;
  epoch: number;
  policyHash: string;
  peerProofDigest: string;
  createdAt: string;
  encryptedPayload: string;
  settlementStatus: "pending" | "reconciled" | "rejected";
  claimStatus?: PromiseStatus;
  sessionSettlementMode?: SessionSettlementMode;
  offlineSettlementTier?: OfflineSettlementTier;
  receiptMaterializationRequired?: boolean;
  settlementFeePolicy?: OfflineSettlementFeePolicy;
  replayProtection?: ReplayProtectionEnvelope;
  directSettlementSignature?: string;
  instantClaimSignature?: string;
  instantSettleSignature?: string;
  risk: RiskSnapshot;
  signingAlgorithms?: PromiseSignatureAlgorithm[];
  signatureBundle?: PromiseSignatureBundle;
  receipt?: TransferReceipt;
  txHash?: string;
}

export interface WalletIdentityProfile {
  walletType: WalletType;
  displayName: string;
  /** @deprecated Brazil-only identity remnants kept as optional compatibility fields. */
  documentType?: DocumentType | null;
  /** @deprecated Brazil-only identity remnants kept as optional compatibility fields. */
  documentId?: string | null;
  /** @deprecated Brazil-only identity remnants kept as optional compatibility fields. */
  birthDate?: string | null;
  /** @deprecated Brazil-only identity remnants kept as optional compatibility fields. */
  businessName?: string | null;
  /** @deprecated Brazil-only identity remnants kept as optional compatibility fields. */
  responsibleName?: string | null;
  /** @deprecated Brazil-only identity remnants kept as optional compatibility fields. */
  responsibleDocumentId?: string | null;
}

export interface WalletProfile extends WalletIdentityProfile {
  walletId: string;
  solanaAddress: string;
  publicKey: string;
  postQuantumPublicKey: string;
  devicePublicKey?: string;
  identityDerivationVersion: number;
  identityContextHash: string;
  identityPublicKey: string;
  publicKeyAnchored: boolean;
  publicKeyAnchorTx?: string | null;
  publicKeyAnchoredAt?: string | null;
  derivationPath: string;
  createdAt: string;
  backupConfirmedAt?: string | null;
  hasPassphrase: boolean;
  exportable: boolean;
  mnemonicWordCount: number;
  isActiveOnDevice?: boolean;
  certificateProfile?: OptionalCertificateProfile | null;
  reputationAnchorHash?: string;
  reputationEnvelope?: ReputationEnvelope;
  lineageGeneration?: number;
  lineageTrustCeiling?: number;
  lineageRiskFloor?: number;
  lineageCooldownUntil?: string | null;
}

export interface WalletRegistryEntry extends WalletIdentityProfile {
  walletId: string;
  solanaAddress: string;
  publicKey: string;
  postQuantumPublicKey?: string;
  devicePublicKey?: string;
  identityDerivationVersion: number;
  identityContextHash: string;
  identityPublicKey: string;
  publicKeyAnchored: boolean;
  publicKeyAnchorTx?: string | null;
  publicKeyAnchoredAt?: string | null;
  createdAt: string;
  backupConfirmedAt?: string | null;
  isActiveOnDevice: boolean;
  certificateProfile?: OptionalCertificateProfile | null;
  reputationAnchorHash?: string;
  reputationEnvelope?: ReputationEnvelope;
  lineageGeneration?: number;
  lineageTrustCeiling?: number;
  lineageRiskFloor?: number;
  lineageCooldownUntil?: string | null;
}

export interface WalletSecurityState {
  storage: "secure-store" | "memory";
  biometryAvailable: boolean;
  biometricProtected: boolean;
  keyEnvelopeVersion: number;
  lastMnemonicRevealAt?: string | null;
  lastImportAt?: string | null;
  certificateImportedAt?: string | null;
  certificateBacked?: boolean;
}

export interface AssetBalance {
  assetId: ChainAssetId;
  amount: string;
  decimals: number;
  lastUpdatedAt: string;
  source: "cached" | "backend" | "simulated" | "rpc";
}

export interface SolanaTransferIntent {
  intentId: string;
  walletId?: string;
  walletType?: WalletType;
  assetId: ChainAssetId;
  fromAddress: string;
  toAddress: string;
  amount: string;
  decimals: number;
  createdAt: string;
  memo?: string;
  reference?: string;
  recentBlockhash?: string;
  tokenMint?: string;
  requiresOnlineAssembly: boolean;
}

export interface SignedSolanaEnvelope {
  intentId: string;
  publicKey: string;
  signedMessage: string;
  signature: string;
  signedAt: string;
  serializedTransaction?: string;
}

export interface PendingChainTransaction {
  walletId?: string;
  walletType?: WalletType;
  intent: SolanaTransferIntent;
  envelope: SignedSolanaEnvelope;
  status: ChainTransactionStatus;
  txSignature?: string;
  metadataAnchorTx?: string;
  metadataPayloadHash?: string;
  lastError?: string;
  submittedAt?: string;
  confirmedAt?: string;
}

export interface ReconciliationBatch {
  batchId: string;
  deviceId: string;
  journalRoot: string;
  txIds: string[];
  evidenceRefs: string[];
  valueTotal: number;
  result: "accepted" | "rejected";
  solanaTxSig?: string;
  metadataAnchorTx?: string;
  metadataPayloadHash?: string;
}

export interface HandshakeEnvelope {
  sessionId: string;
  manifest: DeviceManifest;
  baseRoot: string;
  nonce: string;
  counter: number;
  signature: string;
  walletId?: string;
  walletType?: WalletType;
  signatureBundle?: PromiseSignatureBundle;
}

export interface ApprovalContext {
  allowance?: OffAirAllowance;
  /** @deprecated Use allowance. */
  budget?: OfflineBudget;
  policy: AllowlistPolicy;
  manifest: DeviceManifest;
  amount: number;
  offlineSettlementTier?: OfflineSettlementTier;
  pendingTransfers: number;
  risk: RiskSnapshot;
}

export interface ProtocolLimits {
  maxOffAirPerWallet: number;
  fastOfflineNewUserLimitLamports?: string;
  fastOfflineTrustedLimitLamports?: string;
  fastOfflineHighTrustLimitLamports?: string;
  verifiedOfflineMinLamports?: string;
  offairMintAddress?: string;
  paused?: boolean;
}

export interface ReserveBalance {
  walletId: string;
  walletAddress: string;
  vaultAddress: string;
  lamports: string;
  sol: string;
  committedLamports: string;
  committedSol: string;
  withdrawableLamports: string;
  withdrawableSol: string;
  capacityIssuedLamports?: string;
  capacityIssuedSol?: string;
  capacityAvailableLamports?: string;
  capacityAvailableSol?: string;
  pendingPromiseCount?: number;
  updatedAt?: string;
}

export interface WalletPublicProfile {
  walletId: string;
  walletPublicKey: string;
  pqPublicKey: string;
  activeDevicePublicKey?: string;
  registeredAt: string;
  updatedAt?: string;
}

export interface DeviceKeyRotationRequest {
  walletId: string;
  nextDevicePublicKey: string;
  rotatedAt: string;
}

export interface BlacklistEntry {
  address: string;
  active: boolean;
  reason?: string;
  updatedAt: string;
}

export interface PromiseDraft {
  promiseId: string;
  walletId?: string;
  senderAddress: string;
  receiverAddress: string;
  amountLamports: string;
  offairAmount: string;
  createdAt: string;
  payloadHash: string;
}

export interface SignedPromiseEnvelope {
  draft: PromiseDraft;
  digest: string;
  signatureBundle: PromiseSignatureBundle;
}

export interface PromiseClaim {
  promiseId: string;
  senderWalletId?: string;
  receiverWalletId?: string;
  receiverAddress: string;
  claimedAt: string;
  status: PromiseStatus;
  offairAmount: string;
}

export interface PromiseTokenState {
  promiseId: string;
  receiverAddress: string;
  receiptMint: string;
  receiptTokenAccount: string;
  mintedAt: string;
  settlementFeePayer?: OfflineSettlementFeePayer;
  feePayerAddress?: string;
}

export interface PromiseChainState {
  promiseId: string;
  senderWalletId?: string;
  receiverWalletId?: string;
  senderAddress: string;
  receiverAddress: string;
  amountLamports: string;
  offairAmount: string;
  status: PromiseStatus;
  offlineSettlementTier?: OfflineSettlementTier;
  receiptMaterializationRequired?: boolean;
  createdAt: string;
  lastAttemptAt?: string;
  settledAt?: string;
  claimTx?: string;
  settleTx?: string;
  receiptMint?: string;
  receiptTokenAccount?: string;
  receiptMintedAt?: string;
  settlementFeePayer?: OfflineSettlementFeePayer;
  feePayerAddress?: string;
}
