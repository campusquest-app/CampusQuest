import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { userHasModerationAdminAccess } from "@/lib/server/adminEmails";
import { ApiError } from "@/lib/server/http";
import {
  assertDmMediaPath,
  parseDmStorageRef,
  sniffAudioMimeFromBytes,
  storedDmMediaRef,
} from "@/lib/server/dmRichMessages";
import { geocodeUriBuilding } from "@/lib/server/geocoding/googleCampusGeocoder";
import { userHasPlatformAdminAccess } from "@/lib/server/permissions";
import { scanCampusQuestQrCode } from "@/lib/server/qrCodeScan";
import { secretsEqual } from "@/lib/server/secretCompare";
import { cleanedSearchTerm, sanitizeIlikeNeedle } from "@/lib/server/friendsGuildsSearch";
import {
  claimBeginnerQuestReward,
  completeQuest,
  createGuild,
  joinGuild,
  logActivity,
  scanQrQuest,
} from "@/lib/server/services";
import { sniffImageMimeFromBytes } from "@/lib/server/sniffImageMime";

const root = process.cwd();

function featureDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404 && error.code === "FEATURE_DISABLED";
}

describe("hidden gamification is denied before any database write", () => {
  const userClient = {
    from() {
      throw new Error("database should not be touched");
    },
  };

  it("rejects activity, quest, guild, and QR reward entry points", async () => {
    await expect(
      logActivity({ userClient: userClient as never, userId: "student", activityId: "walk" }),
    ).rejects.toSatisfy(featureDisabled);
    await expect(
      claimBeginnerQuestReward({ userClient: userClient as never, userId: "student", questId: "profile" }),
    ).rejects.toSatisfy(featureDisabled);
    await expect(
      completeQuest({ userClient: userClient as never, userId: "student", userQuestId: "quest" }),
    ).rejects.toSatisfy(featureDisabled);
    await expect(
      scanQrQuest({ userClient: userClient as never, userId: "student", qrCode: "CQ-1" }),
    ).rejects.toSatisfy(featureDisabled);
    await expect(
      joinGuild({ userClient: userClient as never, userId: "student", guildId: "guild" }),
    ).rejects.toSatisfy(featureDisabled);
    await expect(
      createGuild({
        userClient: userClient as never,
        userId: "student",
        name: "Hall",
        description: "no",
        isPublic: true,
      }),
    ).rejects.toSatisfy(featureDisabled);
    await expect(
      scanCampusQuestQrCode({ userClient: userClient as never, userId: "student", code: "CQ-1" }),
    ).rejects.toSatisfy(featureDisabled);
  });

  it("keeps the student-callable reward routes behind the same gate", () => {
    const routes = [
      "app/api/activities/log/route.ts",
      "app/api/onboarding/beginner-quests/claim/route.ts",
      "app/api/quests/complete/route.ts",
      "app/api/quests/scan-qr/route.ts",
      "app/api/qr/scan/route.ts",
      "app/api/streaks/update/route.ts",
      "app/api/guilds/join/route.ts",
      "app/api/guilds/route.ts",
      "app/api/me/boss/route.ts",
      "app/api/proof/upload/route.ts",
      "app/api/quests/admin/[questId]/complete/route.ts",
      "app/api/internal/admin/users/[userId]/xp/route.ts",
    ];
    for (const route of routes) {
      const source = fs.readFileSync(path.join(root, route), "utf8");
      expect(source, route).toContain("assertLaunchProgressionEnabled()");
    }
    const guildRoute = fs.readFileSync(path.join(root, "app/api/guilds/route.ts"), "utf8");
    const getBody = guildRoute.slice(guildRoute.indexOf("export async function GET"), guildRoute.indexOf("export async function POST"));
    expect(getBody).not.toContain("assertLaunchProgressionEnabled()");
  });
});

describe("DM media stays inside the conversation", () => {
  it("rejects another conversation and path traversal", () => {
    expect(() =>
      storedDmMediaRef("dm-images/other-conversation/user/file.jpg", "conversation-a", "dm-images"),
    ).toThrow(ApiError);
    expect(() => storedDmMediaRef("dm-images/conversation-a/../secret.jpg", "conversation-a", "dm-images")).toThrow(
      ApiError,
    );
    expect(() => assertDmMediaPath("conversation-a/user/file.jpg", "conversation-b")).toThrow(ApiError);
  });

  it("stores a path ref parsed from a signed URL", () => {
    const signed =
      "https://proj.supabase.co/storage/v1/object/sign/dm-images/conversation-a/user/file.jpg?token=abc";
    expect(parseDmStorageRef(signed)).toEqual({
      bucket: "dm-images",
      path: "conversation-a/user/file.jpg",
    });
    expect(storedDmMediaRef(signed, "conversation-a", "dm-images")).toBe(
      "dm-images/conversation-a/user/file.jpg",
    );
  });

  it("rejects an image whose bytes do not match the declared type", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMimeFromBytes(png)).toBe("image/png");
    expect(sniffImageMimeFromBytes(Buffer.from("not-an-image"))).toBeNull();
    expect(sniffAudioMimeFromBytes(Buffer.from("RIFF....WAVE", "ascii"))).toBe("audio/wav");
  });
});

describe("admin email is not authority by itself", () => {
  it("does not promote an unconfirmed allow-list or fallback email", () => {
    process.env.MODERATION_ADMIN_EMAILS = "campusquest@campusquestapp.com";
    const unconfirmed = {
      email: "campusquest@campusquestapp.com",
      email_confirmed_at: null,
      confirmed_at: null,
    } as unknown as User;
    expect(userHasPlatformAdminAccess(unconfirmed, "student")).toBe(false);
    expect(userHasModerationAdminAccess(unconfirmed)).toBe(false);
    const fallback = {
      email: "nicklockhart22@gmail.com",
      email_confirmed_at: null,
    } as unknown as User;
    expect(userHasPlatformAdminAccess(fallback, "student")).toBe(false);
  });

  it("keeps persisted admin authority and confirmed allow-list email", () => {
    process.env.MODERATION_ADMIN_EMAILS = "campusquest@campusquestapp.com";
    const persisted = { email: "student@uri.edu", email_confirmed_at: null } as unknown as User;
    expect(userHasPlatformAdminAccess(persisted, "admin")).toBe(true);
    const confirmed = {
      email: "campusquest@campusquestapp.com",
      email_confirmed_at: "2026-01-01T00:00:00Z",
    } as unknown as User;
    expect(userHasPlatformAdminAccess(confirmed, "student")).toBe(true);
  });
});

describe("shared secrets and geocoding fail closed", () => {
  it("compares secrets without accepting a prefix or a different value", () => {
    expect(secretsEqual("correct-horse", "correct-horse")).toBe(true);
    expect(secretsEqual("correct-horse", "correct-horses")).toBe(false);
    expect(secretsEqual("correct", "correct-horse")).toBe(false);
    expect(secretsEqual("", "correct-horse")).toBe(false);
    expect(secretsEqual(null, "correct-horse")).toBe(false);
  });

  it("does not geocode with the public browser maps key", async () => {
    vi.stubEnv("GOOGLE_MAPS_GEOCODING_API_KEY", "");
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "browser-key");
    const fetchImpl = vi.fn();
    await expect(
      geocodeUriBuilding({ buildingName: "Memorial Union", fetchImpl: fetchImpl as never }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("strips ilike wildcards and length-limits organization search", () => {
    expect(cleanedSearchTerm("  %_alpha_,beta  ")).toBe("alphabeta");
    expect(sanitizeIlikeNeedle("%_alpha_")).toBe("%alpha%");
    expect(cleanedSearchTerm("a".repeat(200))).toHaveLength(120);
  });
});

describe("removed production attack surface", () => {
  it("deletes the schema-mutation HTTP route and certificate bypass", () => {
    expect(fs.existsSync(path.join(root, "app/api/internal/admin/apply-qr-bootstrap/route.ts"))).toBe(false);
    const hits = [
      "app",
      "lib",
      "scripts",
    ].flatMap((dir) => walk(path.join(root, dir)));
    for (const file of hits) {
      const text = fs.readFileSync(file, "utf8");
      expect(text, file).not.toContain("rejectUnauthorized: false");
    }
    expect(fs.readFileSync(path.join(root, "lib/server/supabase.ts"), "utf8")).toContain('import "server-only"');
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}
