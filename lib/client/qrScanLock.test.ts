import { describe, expect, it } from "vitest";
import { acquireQrRedeemLock, releaseQrRedeemLock } from "@/lib/client/qrScanLock";

describe("qrScanLock", () => {
  it("allows one in-flight redeem per user+code", () => {
    const first = acquireQrRedeemLock("user-1", "GYM");
    expect(first.acquired).toBe(true);
    if (!first.acquired) return;

    const second = acquireQrRedeemLock("user-1", "GYM");
    expect(second.acquired).toBe(false);

    releaseQrRedeemLock("user-1", "GYM");
    const third = acquireQrRedeemLock("user-1", "GYM");
    expect(third.acquired).toBe(true);
    releaseQrRedeemLock("user-1", "GYM");
  });
});
