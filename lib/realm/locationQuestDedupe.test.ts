import { describe, expect, it, vi } from "vitest";
import {
  countUniqueLocationQuests,
  getQuestDedupKey,
  hasQrQuestCard,
  mergeLocationQuestCards,
  normalizeQuestTitle,
} from "./locationQuestDedupe";

describe("locationQuestDedupe", () => {
  it("normalizes titles for fallback keys", () => {
    expect(normalizeQuestTitle("  Visit   the AI Lab ")).toBe("visit the ai lab");
  });

  it("prefers admin quest id for dedupe key", () => {
    expect(
      getQuestDedupKey({
        id: "quest-1",
        adminQuestId: "quest-1",
        title: "Visit the AI Lab",
        locationId: "library",
      }),
    ).toBe("admin:quest-1");
  });

  it("merges linked QR pin and board quest into one card", () => {
    const cards = mergeLocationQuestCards({
      locationId: "library",
      qrCodes: [
        {
          id: "qr-1",
          name: "Visit the AI Lab",
          description: "",
          xpReward: 50,
          expiresAt: null,
          scanPath: "/scan?code=abc",
          qrCode: "abc",
          adminQuestId: "quest-1",
        },
      ],
      mapQuests: [
        {
          id: "quest-1",
          name: "Visit the AI Lab",
          description: "Explore the lab",
          xpReward: 50,
          difficulty: "easy",
          completionMethod: "qr_scan",
          requiresQr: true,
          expiresAt: null,
          icon: "🎯",
          qrCodeId: "qr-1",
        },
      ],
      boardQuests: [
        {
          id: "quest-1",
          source: "admin",
          name: "Visit the AI Lab",
          description: "Explore the lab",
          xpReward: 50,
          difficulty: "easy",
          questType: "location",
          icon: "🎯",
          requiresQr: true,
          completionMethod: "qr_scan",
          locationName: "Library",
          locationId: "library",
          locationLat: null,
          locationLng: null,
          status: "ready",
          progress: { current: 0, max: 1, percent: 0 },
          startsAt: null,
          endsAt: null,
          repeatType: "one_time",
          canClaim: false,
          qrCodeId: "qr-1",
        },
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("board");
    if (cards[0]?.kind === "board") {
      expect(cards[0].item.status).toBe("ready");
      expect(cards[0].scanPath).toBe("/scan?code=abc");
    }
  });

  it("keeps separate quests with different ids", () => {
    const cards = mergeLocationQuestCards({
      locationId: "library",
      qrCodes: [],
      mapQuests: [
        {
          id: "quest-a",
          name: "Quest A",
          description: "",
          xpReward: 10,
          difficulty: "easy",
          completionMethod: "manual_log",
          requiresQr: false,
          expiresAt: null,
          icon: "🎯",
        },
        {
          id: "quest-b",
          name: "Quest B",
          description: "",
          xpReward: 20,
          difficulty: "medium",
          completionMethod: "manual_log",
          requiresQr: false,
          expiresAt: null,
          icon: "📚",
        },
      ],
      boardQuests: [],
    });

    expect(cards).toHaveLength(2);
  });

  it("counts unique map quests without double-counting linked QR", () => {
    const count = countUniqueLocationQuests(
      {
        qrCodes: [
          {
            id: "qr-1",
            name: "Visit the AI Lab",
            description: "",
            xpReward: 50,
            expiresAt: null,
            scanPath: "/scan?code=abc",
            qrCode: "abc",
            adminQuestId: "quest-1",
          },
        ],
        quests: [
          {
            id: "quest-1",
            name: "Visit the AI Lab",
            description: "",
            xpReward: 50,
            difficulty: "easy",
            completionMethod: "qr_scan",
            requiresQr: true,
            expiresAt: null,
            icon: "🎯",
            qrCodeId: "qr-1",
          },
        ],
      },
      "library",
    );

    expect(count).toBe(1);
  });

  it("merges map quest and linked QR pin into one card with scan path", () => {
    const cards = mergeLocationQuestCards({
      locationId: "library",
      qrCodes: [
        {
          id: "qr-1",
          name: "Visit the AI Lab",
          description: "",
          xpReward: 40,
          expiresAt: null,
          scanPath: "/scan?code=abc",
          qrCode: "abc",
          adminQuestId: "quest-1",
        },
      ],
      mapQuests: [
        {
          id: "quest-1",
          name: "Visit the AI Lab",
          description: "Explore the lab",
          xpReward: 40,
          difficulty: "easy",
          completionMethod: "qr_scan",
          requiresQr: true,
          expiresAt: null,
          icon: "🎯",
          qrCodeId: "qr-1",
        },
      ],
      boardQuests: [],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe("board");
    if (cards[0]?.kind === "board") {
      expect(cards[0].item.name).toBe("Visit the AI Lab");
      expect(cards[0].item.requiresQr).toBe(true);
      expect(cards[0].scanPath).toBe("/scan?code=abc");
    }
    expect(hasQrQuestCard(cards[0]!)).toBe(true);
  });

  it("logs deduped duplicates in development", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");

    mergeLocationQuestCards({
      locationId: "library",
      qrCodes: [
        {
          id: "qr-1",
          name: "Visit the AI Lab",
          description: "",
          xpReward: 50,
          expiresAt: null,
          scanPath: "/scan?code=abc",
          qrCode: "abc",
          adminQuestId: "quest-1",
        },
      ],
      boardQuests: [
        {
          id: "quest-1",
          source: "admin",
          name: "Visit the AI Lab",
          description: "",
          xpReward: 50,
          difficulty: "easy",
          questType: "location",
          icon: "🎯",
          requiresQr: true,
          completionMethod: "qr_scan",
          locationName: "Library",
          locationId: "library",
          locationLat: null,
          locationLng: null,
          status: "ready",
          progress: { current: 0, max: 1, percent: 0 },
          startsAt: null,
          endsAt: null,
          repeatType: "one_time",
          canClaim: false,
          qrCodeId: "qr-1",
        },
      ],
    });

    expect(info).toHaveBeenCalledWith(
      "[cq][realm-location] deduped duplicate quest",
      expect.objectContaining({ key: "admin:quest-1" }),
    );

    info.mockRestore();
    vi.unstubAllEnvs();
  });
});
