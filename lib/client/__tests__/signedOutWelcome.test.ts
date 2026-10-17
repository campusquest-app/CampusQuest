import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAppShellRoute, resolveProfileRoute } from "@/lib/client/appShellRoute";

const welcome = readFileSync("components/auth/SignedOutWelcome.tsx", "utf8");
const auth = readFileSync("components/AuthScreen.tsx", "utf8");
const home = readFileSync("app/page.tsx", "utf8");
const dashboard = readFileSync("components/Dashboard.tsx", "utf8");

describe("signed-out welcome entry", () => {
  it("shows the new headline on the canonical welcome", () => {
    expect(welcome).toContain("Your campus.");
    expect(welcome).toContain("Your community.");
    expect(welcome).toContain("Your adventure.");
    expect(welcome).toContain("Discover events, connect with students, and make the most of college life.");
    expect(welcome).toContain("Get Started");
    expect(welcome).toContain("Sign In");
    expect(welcome).toContain("CAMPUSQUEST_LOGO_SRC");
  });

  it("does not keep the old welcome copy or knight on the entry screen", () => {
    expect(welcome).not.toContain("Welcome to CampusQuest");
    expect(welcome).not.toContain("Join CampusQuest");
    expect(welcome).not.toContain("Your quest.");
    expect(welcome).not.toContain("BRAND_KNIGHT");
    expect(auth).not.toContain("cq-auth-landing-mobile");
    expect(auth).not.toContain("<AuthDesktopLanding");
    expect(auth).not.toContain("Join CampusQuest");
  });

  it("sends Get Started into signup and Sign In into login", () => {
    const start = auth.indexOf('if (mode === "welcome")');
    const welcomeBranch = auth.slice(start, start + 420);
    expect(welcomeBranch).toContain("<SignedOutWelcome");
    expect(welcomeBranch).toContain('onGetStarted={() => switchMode("signup")}');
    expect(welcomeBranch).toContain('onSignIn={() => switchMode("signin")}');
  });

  it("uses one home route for web and native, and only when signed out", () => {
    expect(home).toContain("<Dashboard />");
    expect(dashboard).toContain('destinationRoute === "auth"');
    expect(dashboard).toContain("<AuthScreen");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "unauthenticated",
        profileRoute: "unknown",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("auth");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "app",
        showPostLoginLoading: false,
        hasCharacter: true,
      }),
    ).toBe("app");
  });

  it("resumes partial onboarding instead of the welcome screen", () => {
    const partial = {
      onboarding_completed: false,
      role: "student",
      student_status: "current_or_incoming",
      institution_id: "uri",
      onboarding_version: 2,
      campus_email_verified_at: "2026-01-01T00:00:00.000Z",
      display_name_changed_at: "2026-01-01T00:00:00.000Z",
    };
    const profileRoute = resolveProfileRoute(partial, {
      preferences: { interests: ["a", "b", "c"], institutionId: "uri" },
    });
    expect(profileRoute).toBe("character_gate");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute,
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).toBe("onboarding");
    expect(
      resolveAppShellRoute({
        bootstrapStatus: "authenticated",
        profileRoute: "demographics_gate",
        showPostLoginLoading: false,
        hasCharacter: false,
      }),
    ).not.toBe("auth");
  });
});
