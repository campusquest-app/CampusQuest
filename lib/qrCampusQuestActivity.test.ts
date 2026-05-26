import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCampusQuestStatLabel,
  parseCampusQuestQrPayload,
  qrRedemptionKeyFromPayload,
} from "./qrCampusQuestActivity";

describe("normalizeCampusQuestStatLabel", () => {
  it("maps labels and lowercase keys", () => {
    expect(normalizeCampusQuestStatLabel("Knowledge")).toBe("knowledge");
    expect(normalizeCampusQuestStatLabel("STAMINA")).toBe("stamina");
    expect(normalizeCampusQuestStatLabel("social")).toBe("social");
    expect(normalizeCampusQuestStatLabel("not a stat")).toBeNull();
  });
});

describe("parseCampusQuestQrPayload", () => {
  it("accepts canonical JSON payloads", () => {
    const raw = JSON.stringify({
      type: "campusquest_activity",
      activityId: "td_workshop_001",
      activityName: "TD Workshop",
      xp: 150,
      stat: "Knowledge",
      statIncrease: 10,
    });
    const r = parseCampusQuestQrPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.stat).toBe("knowledge");
    expect(r.payload.xp).toBe(150);
    expect(r.payload.statIncrease).toBe(10);
    expect(r.payload.activityName).toBe("TD Workshop");
  });

  it("defaults activity name from id", () => {
    const raw = JSON.stringify({
      type: "campusquest_activity",
      activityId: "evt_abc",
      xp: 5,
      stat: "focus",
      statIncrease: 1,
    });
    const r = parseCampusQuestQrPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.activityName).toBe("evt_abc");
  });

  it("rejects unknown types", () => {
    const r = parseCampusQuestQrPayload(
      JSON.stringify({ type: "other", activityId: "x", xp: 1, stat: "Focus", statIncrease: 1 }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects expired codes", () => {
    const r = parseCampusQuestQrPayload(
      JSON.stringify({
        type: "campusquest_activity",
        activityId: "past",
        xp: 1,
        stat: "Focus",
        statIncrease: 1,
        expiresAt: Date.now() - 60_000,
      }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("expired");
  });
});

describe("qrRedemptionKeyFromPayload", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T15:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keys by nonce when provided", () => {
    const key = qrRedemptionKeyFromPayload({
      activityId: "a",
      activityName: "A",
      xp: 1,
      stat: "focus",
      statIncrease: 1,
      nonce: "one-time-99",
    });
    expect(key).toBe("nonce:one-time-99");
  });

  it("keys by activity + local calendar day when no nonce", () => {
    const key = qrRedemptionKeyFromPayload({
      activityId: "daily_checkin",
      activityName: "Daily",
      xp: 1,
      stat: "social",
      statIncrease: 1,
    });
    expect(key).toMatch(/^day:daily_checkin:\d{4}-\d{2}-\d{2}$/);
  });
});
