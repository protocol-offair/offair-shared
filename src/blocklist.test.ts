import { describe, expect, it } from "vitest";

import {
  blocklistLeafHashHex,
  blocklistNodeHashHex,
  calculateBlocklistRecoveryRequirement,
  replayActiveBlocklist,
} from "./blocklist";

describe("blocklist Merkle and recovery helpers", () => {
  it("calculates the delisting recovery formula with a 10% protocol fee on admin costs", () => {
    expect(
      calculateBlocklistRecoveryRequirement({
        obligationLamports: 300_000_000n,
        entryAdminCostLamports: 20_000_000n,
        exitAdminCostLamports: 10_000_000n,
      }),
    ).toEqual({
      obligationLamports: "300000000",
      adminCostEntryLamports: "20000000",
      adminCostExitLamports: "10000000",
      protocolFeeLamports: "3000000",
      unlockTotalLamports: "333000000",
    });
  });

  it("replays append-only events into the active blocklist set", () => {
    const active = replayActiveBlocklist([
      {
        wallet: "A",
        action: "listed",
        epoch: 1,
        timestamp: "2026-05-16T00:00:00.000Z",
        reasonHash: "00",
        adminCostLamports: "0",
        obligationLamports: "0",
      },
      {
        wallet: "B",
        action: "listed",
        epoch: 2,
        timestamp: "2026-05-16T00:01:00.000Z",
        reasonHash: "00",
        adminCostLamports: "0",
        obligationLamports: "0",
      },
      {
        wallet: "A",
        action: "delisted",
        epoch: 3,
        timestamp: "2026-05-16T00:02:00.000Z",
        reasonHash: "00",
        adminCostLamports: "0",
        obligationLamports: "0",
      },
    ]);

    expect([...active]).toEqual(["B"]);
  });

  it("uses domain-separated hashes for leaf and node values", () => {
    const walletBytes = new Uint8Array(32);
    walletBytes[31] = 7;
    const sibling = "11".repeat(32);
    const leaf = blocklistLeafHashHex(walletBytes);

    expect(leaf).toHaveLength(64);
    expect(blocklistNodeHashHex(leaf, sibling)).toHaveLength(64);
    expect(blocklistNodeHashHex(leaf, sibling)).not.toEqual(blocklistNodeHashHex(sibling, leaf));
  });
});
