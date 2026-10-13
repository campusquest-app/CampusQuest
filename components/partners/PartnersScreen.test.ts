import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PartnerCard } from "@/components/partners/PartnerCard";
import { PartnerDetailView } from "@/components/partners/PartnerDetailSheet";
import { PartnersScreenView } from "@/components/partners/PartnersScreen";
import type { PartnersLoadState } from "@/lib/client/usePartners";
import { definePartner, PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import type { Partner } from "@/lib/partners/types";

const NOW = new Date("2026-10-05T12:00:00Z");

const daisys = PARTNER_DIRECTORY.find((p) => p.slug === "daisys-chicken-ice-cream")!;
const sandbar = PARTNER_DIRECTORY.find((p) => p.slug === "the-sandbar-cafe")!;
const DAISYS_HTML = daisys.name.replace(/&/g, "&amp;");

function renderScreen(state: PartnersLoadState, initialQuery?: string): string {
  return renderToStaticMarkup(createElement(PartnersScreenView, { state, onRetry: () => {}, now: NOW, initialQuery }));
}

function renderCard(partner: Partner): string {
  return renderToStaticMarkup(createElement(PartnerCard, { partner, onSelect: () => {}, now: NOW }));
}

function renderDetail(partner: Partner): string {
  return renderToStaticMarkup(createElement(PartnerDetailView, { partner, onClose: () => {}, now: NOW }));
}

const ready: PartnersLoadState = { status: "ready", partners: PARTNER_DIRECTORY };

describe("PartnersScreenView", () => {
  it("renders the header, subtitle and search bar", () => {
    const html = renderScreen({ status: "loading" });
    expect(html).toContain("CampusQuest Partners");
    expect(html).toContain("Explore local businesses. Unlock exclusive student rewards.");
    expect(html).toContain('placeholder="Search partners..."');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("cq-partner-card--skeleton");
  });

  it("lists Daisy's first and Sandbar second, then the coming-soon line", () => {
    const html = renderScreen(ready);
    const d = html.indexOf(DAISYS_HTML);
    const s = html.indexOf(sandbar.name);
    expect(d).toBeGreaterThan(-1);
    expect(s).toBeGreaterThan(d);
    expect(html).toContain("More CampusQuest partners coming soon.");
    expect(html).not.toContain("Local quests are coming soon");
  });

  it("filters by search query", () => {
    const coffee = renderScreen(ready, "coffee");
    expect(coffee).toContain(sandbar.name);
    expect(coffee).not.toContain(DAISYS_HTML);

    const daisy = renderScreen(ready, "daisy");
    expect(daisy).toContain(DAISYS_HTML);
    expect(daisy).not.toContain(sandbar.name);
  });

  it("shows the no-results state for an unmatched search", () => {
    const html = renderScreen(ready, "pizza");
    expect(html).toContain("No partners found");
    expect(html).toContain("Try a different search.");
    expect(html).not.toContain("cq-partner-card");
    expect(html).not.toContain("More CampusQuest partners coming soon.");
  });

  it("hides inactive partners", () => {
    const html = renderScreen({
      status: "ready",
      partners: [definePartner({ id: "x", slug: "x", name: "Hidden Shop", isActive: false })],
    });
    expect(html).not.toContain("Hidden Shop");
    expect(html).toContain("No partners found");
  });

  it("shows a retryable error state", () => {
    const html = renderScreen({ status: "error", message: "boom" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain("boom");
  });

  it("renders any partner from data without partner-specific UI", () => {
    const next = definePartner({
      id: "new",
      slug: "new-shop",
      name: "New Shop",
      categories: ["Pizza"],
      address: "1 Main St, Kingston, RI",
      discountValue: "Free drink",
      offerTitle: "with any slice",
    });
    const html = renderScreen({ status: "ready", partners: [...PARTNER_DIRECTORY, next] });
    expect(html).toContain("New Shop");
    expect(html).toContain("Free drink");
    expect(html.indexOf("New Shop")).toBeGreaterThan(html.indexOf(sandbar.name));
  });
});

describe("PartnerCard", () => {
  it("shows Daisy's 20% URI student offer, chips, address and quick actions", () => {
    const html = renderCard(daisys);
    expect(html).toContain("CampusQuest Partner");
    expect(html).toContain("20% OFF");
    expect(html).toContain("for URI students");
    expect(html).toContain("Chicken");
    expect(html).toContain("Ice Cream");
    expect(html).toContain("106 Point Judith Rd, Narragansett, RI");
    expect(html).toContain("View Partner");
    expect(html).toContain("Directions");
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=');
    expect(html).toContain('href="https://daisysnarragansett.com/"');
    expect(html).toContain('src="/partners/daisys/cover.jpg"');
  });

  it("does not invent a reward for Sandbar", () => {
    const html = renderCard(sandbar);
    expect(html).toContain("Student reward coming soon");
    expect(html).not.toMatch(/%\s*off/i);
    expect(html).not.toContain("cq-partner-reward__value");
    expect(html).toContain("Menu");
    expect(html).toContain('href="https://order.toasttab.com/online/the-sandbar-cafe-106-point-judith-road"');
    expect(html).toContain('src="/partners/sandbar/logo.png"');
  });

  it("falls back to a neutral placeholder and hides links when none exist", () => {
    const html = renderCard(definePartner({ id: "p", slug: "p", name: "Plain" }));
    expect(html).toContain("cq-partner-media--placeholder");
    expect(html).not.toContain("Directions");
    expect(html).not.toContain("Website");
    expect(html).not.toContain("Menu");
  });
});

describe("PartnerDetailView", () => {
  it("shows Daisy's full partner details with reward and redemption", () => {
    const html = renderDetail(daisys);
    expect(html).toContain('role="dialog"');
    expect(html).toContain(DAISYS_HTML);
    expect(html).toContain("CampusQuest Partner");
    expect(html).toContain(daisys.description!);
    expect(html).toContain("20% OFF");
    expect(html).toContain("for URI students");
    expect(html).toContain("Show your CampusQuest account at checkout.");
    expect(html).toContain("daisysnarragansett.com");
    expect(html).toContain('src="/partners/daisys/logo.jpg"');
  });

  it("shows Sandbar without a reward or redemption instructions", () => {
    const html = renderDetail(sandbar);
    expect(html).toContain("Student reward coming soon");
    expect(html).not.toContain("How to redeem");
    expect(html).toContain("View menu");
  });
});

describe("partners directory data", () => {
  it("only references local assets that exist", () => {
    for (const p of PARTNER_DIRECTORY) {
      for (const url of [p.coverImageUrl, p.logoUrl]) {
        if (!url) continue;
        expect(url.startsWith("/partners/")).toBe(true);
        expect(existsSync(join(process.cwd(), "public", url))).toBe(true);
      }
    }
  });

  it("does not configure hours or a Sandbar reward that have not been confirmed", () => {
    for (const p of PARTNER_DIRECTORY) expect(p.hours).toBeNull();
    expect(sandbar.discountValue).toBeNull();
    expect(sandbar.offerTitle).toBeNull();
    expect(sandbar.redemptionInstructions).toBeNull();
  });

  it("never mentions CampusQuest Day in the partners feature", () => {
    const dirs = ["components/partners", "lib/partners"];
    const files = dirs.flatMap((dir) =>
      readdirSync(join(process.cwd(), dir))
        .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
        .map((f) => join(dir, f)),
    );
    files.push("app/api/partners/route.ts");
    for (const file of files) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(/campus\s*quest[\s_-]*day/i);
    }
    expect(renderScreen(ready)).not.toMatch(/campusquest day/i);
  });

  it("the API route requires auth and serves the directory without an admin client", () => {
    const route = readFileSync(join(process.cwd(), "app/api/partners/route.ts"), "utf8");
    expect(route).toContain("requireAuthUser");
    expect(route).toContain("PARTNER_DIRECTORY");
    expect(route).not.toMatch(/service[_-]?role|createAdminClient|getSupabaseAdmin/i);
  });
});
