import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canConfirmAccountDeletion, settingsDestination } from "@/lib/client/settingsDestinations";
import type { SettingsActionId } from "@/components/AppSettingsPanel";

const ROWS: SettingsActionId[] = [
  "account",
  "account-type",
  "profile-character",
  "demographics",
  "notifications",
  "push-notifications",
  "delete-account",
  "privacy",
  "blocked-users",
  "tags-mentions",
  "campus",
  "appearance",
  "sound",
  "sign-out",
];

describe("settings destinations", () => {
  it("sends every settings row to its own destination", () => {
    expect(settingsDestination("account")).toEqual({ kind: "drawer", panel: "account" });
    expect(settingsDestination("account-type")).toEqual({ kind: "account-type" });
    expect(settingsDestination("profile-character")).toEqual({ kind: "profile" });
    expect(settingsDestination("demographics")).toEqual({ kind: "drawer", panel: "demographics" });
    expect(settingsDestination("notifications")).toEqual({ kind: "inbox" });
    expect(settingsDestination("push-notifications")).toEqual({ kind: "drawer", panel: "push-notifications" });
    expect(settingsDestination("delete-account")).toEqual({ kind: "drawer", panel: "delete-account" });
    expect(settingsDestination("privacy")).toEqual({ kind: "drawer", panel: "privacy" });
    expect(settingsDestination("blocked-users")).toEqual({ kind: "drawer", panel: "blocked-users" });
    expect(settingsDestination("tags-mentions")).toEqual({ kind: "drawer", panel: "tags-mentions" });
    expect(settingsDestination("campus")).toEqual({ kind: "drawer", panel: "campus" });
    expect(settingsDestination("appearance")).toEqual({ kind: "drawer", panel: "appearance" });
    expect(settingsDestination("sound")).toEqual({ kind: "drawer", panel: "sound" });
    expect(settingsDestination("sign-out")).toEqual({ kind: "sign-out" });
    expect(ROWS).toHaveLength(14);
  });

  it("does not send Campus / School to the profile", () => {
    expect(settingsDestination("campus").kind).not.toBe("profile");
    const dashboard = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");
    const campusCase = dashboard.slice(dashboard.indexOf('case "campus"'), dashboard.indexOf('case "qr-permissions"'));
    expect(campusCase).not.toContain('setTab("character")');
    expect(campusCase).not.toContain('setCharacterPane("profile")');
  });

  it("requires the DELETE confirmation and does not call deletion from the test", () => {
    expect(canConfirmAccountDeletion("delete")).toBe(false);
    expect(canConfirmAccountDeletion(" DELETE ")).toBe(true);
    expect(canConfirmAccountDeletion("")).toBe(false);
    const panel = readFileSync(join(process.cwd(), "components/safety/DeleteAccountPanel.tsx"), "utf8");
    expect(panel).toContain("canConfirmAccountDeletion(confirmation)");
  });

  it("returns every drawer settings screen to Settings", () => {
    const drawer = readFileSync(join(process.cwd(), "components/AppSideDrawer.tsx"), "utf8");
    for (const panel of [
      "account",
      "privacy",
      "campus",
      "appearance",
      "sound",
      "blocked-users",
      "tags-mentions",
      "push-notifications",
      "delete-account",
    ]) {
      const start = drawer.indexOf(`panel === "${panel}"`);
      expect(start).toBeGreaterThan(-1);
      const slice = drawer.slice(start, start + 400);
      expect(slice).toContain('setPanel("settings")');
    }
  });

  it("opens the existing profile editor from Settings and signs out through the auth confirm", () => {
    const dashboard = readFileSync(join(process.cwd(), "components/Dashboard.tsx"), "utf8");
    const profileCase = dashboard.slice(
      dashboard.indexOf('case "profile-character"'),
      dashboard.indexOf('case "account-type"'),
    );
    expect(profileCase).toContain('setTab("character")');
    expect(profileCase).toContain("setProfileEditRequest");
    const profile = readFileSync(join(process.cwd(), "components/MyProfileScreen.tsx"), "utf8");
    expect(profile).toContain("editIdentityRequest");
    expect(profile).toContain("setShowEditIdentity(true)");
    const drawer = readFileSync(join(process.cwd(), "components/AppSideDrawer.tsx"), "utf8");
    expect(drawer).toContain("onRequestSignOut?.()");
    const settings = readFileSync(join(process.cwd(), "components/AppSettingsPanel.tsx"), "utf8");
    expect(settings).toContain('scrollStorageKey="settings-root"');
    expect(settings).toContain("touch-manipulation");
  });

  it("keeps campus verification on the email code flow", () => {
    const campus = readFileSync(join(process.cwd(), "components/settings/CampusSchoolSettingsPanel.tsx"), "utf8");
    expect(campus).toContain("/api/auth/email-verification/send");
    expect(campus).toContain("/api/auth/email-verification/verify");
    expect(campus).not.toContain("setTab(");
    expect(campus).toContain("You cannot mark yourself verified.");
    const account = readFileSync(join(process.cwd(), "components/settings/AccountSettingsPanel.tsx"), "utf8");
    expect(account).toContain("supabaseClient.auth.getSession");
    expect(account).not.toContain("getUser(");
  });

  it("does not offer a theme switch or an admin self-assign control", () => {
    const appearance = readFileSync(join(process.cwd(), "components/settings/AppearanceSettingsPanel.tsx"), "utf8");
    expect(appearance).not.toContain("setTheme");
    expect(appearance).toContain("Dark navy");
    const modal = readFileSync(join(process.cwd(), "components/AccountTypeModal.tsx"), "utf8");
    expect(modal).toContain("Admin access cannot be chosen here.");
    expect(modal).toContain('role: "student"');
    expect(modal).toContain('role: "faculty_staff"');
    const push = readFileSync(join(process.cwd(), "components/safety/PushNotificationsSettingsPanel.tsx"), "utf8");
    expect(push).toContain("deliveryOn && settings[key]");
    const blocked = readFileSync(join(process.cwd(), "components/safety/BlockedUsersPanel.tsx"), "utf8");
    expect(blocked).toContain("Confirm");
  });
});
