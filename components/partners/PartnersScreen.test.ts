import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PartnerCard, partnerCtaLabel } from "@/components/partners/PartnerCard";
import { PartnersScreenView } from "@/components/partners/PartnersScreen";
import type { PartnersLoadState } from "@/lib/client/usePartners";
import type { Partner } from "@/lib/partners/types";

const NOW = new Date("2026-10-05T12:00:00Z");

function partner(overrides: Partial<Partner> = {}): Partner {
  return {
    id: "test-id",
    name: "Test Partner",
    slug: "test-partner",
    logoUrl: null,
    coverImageUrl: null,
    category: "Test Category",
    description: null,
    address: null,
    latitude: null,
    longitude: null,
    partnerSince: null,
    offerType: "standard_offer",
    offerTitle: "Test offer",
    offerDescription: null,
    discountValue: null,
    questTitle: null,
    questDescription: null,
    redemptionInstructions: null,
    startsAt: null,
    endsAt: null,
    websiteUrl: null,
    instagramUrl: null,
    isActive: true,
    isFeatured: false,
    isCampusQuestDay: false,
    ...overrides,
  };
}

function renderScreen(state: PartnersLoadState): string {
  return renderToStaticMarkup(
    createElement(PartnersScreenView, { state, onRetry: () => {}, onSelectPartner: () => {}, now: NOW }),
  );
}

describe("PartnersScreenView", () => {
  it("always renders the header and subtitle", () => {
    const html = renderScreen({ status: "loading" });
    expect(html).toContain("CampusQuest Partners");
    expect(html).toContain("Explore local businesses. Unlock exclusive student rewards.");
  });

  it("shows skeletons (no partner content) while loading", () => {
    const html = renderScreen({ status: "loading" });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("cq-partner-card--skeleton");
    expect(html).not.toContain("CampusQuest Partner<");
  });

  it("shows the empty state when there are zero partners", () => {
    const html = renderScreen({ status: "ready", partners: [] });
    expect(html).toContain("Local quests are coming soon");
    expect(html).toContain("Check back soon for the first CampusQuest Partners.");
    expect(html).not.toContain("cq-partner-card");
  });

  it("shows the empty state when every partner is inactive or not yet started", () => {
    const html = renderScreen({
      status: "ready",
      partners: [partner({ isActive: false }), partner({ id: "u", startsAt: "2027-01-01T00:00:00Z" })],
    });
    expect(html).toContain("Local quests are coming soon");
  });

  it("shows a retryable error state", () => {
    const html = renderScreen({ status: "error", message: "boom" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain("boom");
  });

  it("renders featured, active and expired sections from data", () => {
    const html = renderScreen({
      status: "ready",
      partners: [
        partner({ id: "f", name: "Featured One", isFeatured: true }),
        partner({ id: "a", name: "Active One" }),
        partner({ id: "e", name: "Expired One", endsAt: "2026-09-01T00:00:00Z" }),
      ],
    });
    expect(html).toContain("Featured");
    expect(html).toContain("All partners");
    expect(html).toContain("Past offers");
    expect(html.indexOf("Featured One")).toBeLessThan(html.indexOf("Active One"));
    expect(html.indexOf("Active One")).toBeLessThan(html.indexOf("Expired One"));
    expect(html).not.toContain("Local quests are coming soon");
  });
});

describe("PartnerCard", () => {
  it("shows the partner badge, category, offer and a View Partner CTA", () => {
    const html = renderToStaticMarkup(
      createElement(PartnerCard, { partner: partner({ discountValue: "15% off" }), onSelect: () => {} }),
    );
    expect(html).toContain("CampusQuest Partner");
    expect(html).toContain("Test Category");
    expect(html).toContain("15% off");
    expect(html).toContain("Test offer");
    expect(html).toContain("View Partner");
  });

  it("switches the CTA to View Quest when a quest is attached", () => {
    expect(partnerCtaLabel(partner({ questTitle: "Q" }))).toBe("View Quest");
    expect(partnerCtaLabel(partner())).toBe("View Partner");
  });

  it("marks CampusQuest Day and featured partners", () => {
    const html = renderToStaticMarkup(
      createElement(PartnerCard, { partner: partner({ isCampusQuestDay: true, isFeatured: true }) }),
    );
    expect(html).toContain("CampusQuest Day");
    expect(html).toContain("cq-partner-card--featured");
  });

  it("dims expired offers and hides their CTA", () => {
    const html = renderToStaticMarkup(
      createElement(PartnerCard, { partner: partner(), state: "expired", onSelect: () => {} }),
    );
    expect(html).toContain("Offer ended");
    expect(html).toContain("cq-partner-card--expired");
    expect(html).not.toContain("View Partner");
  });
});

describe("partners feature contains no seeded data", () => {
  it("the API route returns an empty list and the screen has no hardcoded partners", () => {
    const route = readFileSync(join(process.cwd(), "app/api/partners/route.ts"), "utf8");
    expect(route).toContain("partners: []");
    expect(route).toContain("requireAuthUser");
    expect(route).not.toMatch(/service[_-]?role|createAdminClient|getSupabaseAdmin/i);
    const screen = readFileSync(join(process.cwd(), "components/partners/PartnersScreen.tsx"), "utf8");
    expect(screen).not.toMatch(/partners:\s*\[\s*\{/);
  });
});
