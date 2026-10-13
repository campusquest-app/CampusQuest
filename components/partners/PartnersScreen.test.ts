import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeaturedDealCard, PartnerCard } from "@/components/partners/PartnerCard";
import { PartnerDetailView } from "@/components/partners/PartnerDetailSheet";
import { PartnersScreenView, type PerksFavorites } from "@/components/partners/PartnersScreen";
import { RewardPassView } from "@/components/partners/StudentRewardPass";
import { SuggestBusinessForm } from "@/components/partners/SuggestBusinessSheet";
import type { PartnersLoadState } from "@/lib/client/usePartners";
import type { RewardPassState } from "@/lib/client/useRewardPass";
import { definePartner, PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { everyDay, parsePartnerHours } from "@/lib/partners/partnerHours";
import type { PerksFilterId } from "@/lib/partners/partnerStatus";
import type { StudentRewardPass } from "@/lib/partners/rewardAccess";
import type { Partner } from "@/lib/partners/types";

/** Monday Oct 12, 2026 at 1 PM in Narragansett: Daisy's (12–10) open, Sandbar (7–12) closed. */
const AFTERNOON = new Date("2026-10-12T13:00:00-04:00");
/** 9 AM: Sandbar open, Daisy's closed. */
const MORNING = new Date("2026-10-12T09:00:00-04:00");

const daisys = PARTNER_DIRECTORY.find((p) => p.slug === "daisys-chicken-ice-cream")!;
const sandbar = PARTNER_DIRECTORY.find((p) => p.slug === "the-sandbar-cafe")!;
const DAISYS_HTML = daisys.name.replace(/&/g, "&amp;");
const ready: PartnersLoadState = { status: "ready", partners: PARTNER_DIRECTORY };

function favorites(saved: string[] = [], status: PerksFavorites["status"] = "ready"): PerksFavorites {
  return {
    status,
    isSaved: (id) => saved.includes(id),
    isPending: () => false,
    toggle: () => {},
    message: null,
  };
}

function renderScreen(
  state: PartnersLoadState,
  opts: { now?: Date; query?: string; filter?: PerksFilterId; savedOnly?: boolean; favorites?: PerksFavorites } = {},
): string {
  return renderToStaticMarkup(
    createElement(PartnersScreenView, {
      state,
      onRetry: () => {},
      now: opts.now ?? AFTERNOON,
      initialQuery: opts.query,
      initialFilter: opts.filter,
      initialSavedOnly: opts.savedOnly,
      favorites: opts.favorites,
    }),
  );
}

function exploreSection(html: string): string {
  const start = html.indexOf('id="cq-perks-explore-title"');
  return html.slice(start, html.indexOf("cq-perks-suggest", start));
}

function renderDetail(partner: Partner, now = AFTERNOON, initialHoursOpen = false): string {
  return renderToStaticMarkup(
    createElement(PartnerDetailView, { partner, now, onClose: () => {}, onViewReward: () => {}, initialHoursOpen }),
  );
}

describe("Student Perks screen", () => {
  it("renders the header, gift icon, search placeholder, and all six filter chips", () => {
    const html = renderScreen({ status: "loading" });
    expect(html).toContain("Student Perks");
    expect(html).toContain("Discover local favorites. Unlock exclusive student rewards.");
    expect(html).toContain("cq-perks-header__icon");
    expect(html).toContain('placeholder="Search businesses, food, and rewards..."');
    for (const chip of ["All", "Open Now", "Student Deals", "Food", "Coffee", "Dessert"]) {
      expect(html).toContain(`>${chip}</button>`);
    }
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("cq-perk-skeleton--featured");
    expect(html).not.toContain("CampusQuest Partners</h1>");
  });

  it("features Daisy's 20% OFF with photo, open status, and a View Student Reward button", () => {
    const html = renderScreen(ready);
    const start = html.indexOf("Featured Student Deals");
    const featured = html.slice(start, html.indexOf('id="cq-perks-explore-title"'));
    expect(start).toBeGreaterThan(-1);
    expect(featured).toContain(DAISYS_HTML);
    expect(featured).toContain("20% OFF");
    expect(featured).toContain('src="/partners/daisys/cover.jpg"');
    expect(featured).toContain("Open Now");
    expect(featured).toContain("Closes at 10 PM");
    expect(featured).toContain("View Student Reward");
    expect(featured).not.toContain(sandbar.name);
  });

  it("lists both businesses in Explore with category, live hours, and reward badges", () => {
    const explore = exploreSection(renderScreen(ready));
    expect(explore).toContain("Explore Local Businesses");
    expect(explore.indexOf(DAISYS_HTML)).toBeLessThan(explore.indexOf(sandbar.name));
    expect(explore).toContain("Chicken \u00b7 Ice Cream");
    expect(explore).toContain("Coffee \u00b7 Breakfast \u00b7 Drinks");
    expect(explore).toContain("Closed");
    expect(explore).toContain("Opens tomorrow at 7 AM");
    expect(explore).toContain("Reward soon");
    expect(explore).toContain('src="/partners/sandbar/logo.png"');
  });

  it("updates statuses with the clock: Sandbar open in the morning, Daisy's opening at noon", () => {
    const explore = exploreSection(renderScreen(ready, { now: MORNING }));
    expect(explore).toContain("Closes at 12 PM");
    expect(explore).toContain("Opens today at 12 PM");
  });

  it("shows Closing Soon in amber within the last hour", () => {
    const html = renderScreen(ready, { now: new Date("2026-10-12T21:20:00-04:00") });
    expect(html).toContain("cq-perk-status--closing_soon");
    expect(html).toContain("Closing Soon");
  });

  it("Open Now filter uses live hours", () => {
    const afternoon = exploreSection(renderScreen(ready, { filter: "open" }));
    expect(afternoon).toContain(DAISYS_HTML);
    expect(afternoon).not.toContain(sandbar.name);
    const morning = exploreSection(renderScreen(ready, { filter: "open", now: MORNING }));
    expect(morning).toContain(sandbar.name);
    expect(morning).not.toContain(DAISYS_HTML);
    const night = renderScreen(ready, { filter: "open", now: new Date("2026-10-12T23:30:00-04:00") });
    expect(night).toContain("Nothing here right now");
  });

  it("Student Deals, Food, Coffee, and Dessert chips filter correctly", () => {
    expect(exploreSection(renderScreen(ready, { filter: "deals" }))).not.toContain(sandbar.name);
    const coffee = renderScreen(ready, { filter: "coffee" });
    expect(exploreSection(coffee)).toContain(sandbar.name);
    expect(exploreSection(coffee)).not.toContain(DAISYS_HTML);
    expect(coffee).not.toContain("Featured Student Deals");
    expect(exploreSection(renderScreen(ready, { filter: "dessert" }))).not.toContain(sandbar.name);
    const food = exploreSection(renderScreen(ready, { filter: "food" }));
    expect(food).toContain(DAISYS_HTML);
    expect(food).toContain(sandbar.name);
  });

  it("search matches name, category, food type, and menu keywords", () => {
    const latte = exploreSection(renderScreen(ready, { query: "latte" }));
    expect(latte).toContain(sandbar.name);
    expect(latte).not.toContain(DAISYS_HTML);
    expect(exploreSection(renderScreen(ready, { query: "ice cream" }))).toContain(DAISYS_HTML);
    expect(exploreSection(renderScreen(ready, { query: "dessert" }))).not.toContain(sandbar.name);
    expect(renderScreen(ready, { query: "daisy" })).not.toContain("Featured Student Deals");
  });

  it("shows a no-results state with a reset button", () => {
    const html = renderScreen(ready, { query: "pizza" });
    expect(html).toContain("No businesses found");
    expect(html).toContain("Clear search &amp; filters");
    expect(html).not.toContain("cq-perk-card__main");
  });

  it("shows the suggest-a-business CTA at the bottom", () => {
    const html = renderScreen(ready);
    expect(html).toContain("Where should we partner next?");
    expect(html).toContain("Tell us which local businesses you&#x27;d love to see on CampusQuest.");
    expect(html).toContain(">Suggest a Business</button>");
    expect(html.indexOf("Where should we partner next?")).toBeGreaterThan(html.indexOf(sandbar.name));
  });

  it("shows saved businesses and an empty saved state", () => {
    const savedHtml = renderScreen(ready, { savedOnly: true, favorites: favorites(["the-sandbar-cafe"]) });
    expect(savedHtml).toContain("Saved Businesses");
    expect(exploreSection(savedHtml)).toContain(sandbar.name);
    expect(exploreSection(savedHtml)).not.toContain(DAISYS_HTML);
    expect(savedHtml).toContain('aria-pressed="true"');
    expect(savedHtml).toContain('aria-label="Remove The Sandbar Cafe from saved"');
    const empty = renderScreen(ready, { savedOnly: true, favorites: favorites([]) });
    expect(empty).toContain("No saved businesses yet");
  });

  it("hides favorites UI entirely while the favorites table is unavailable", () => {
    const html = renderScreen(ready, { favorites: favorites([], "unavailable") });
    expect(html).not.toContain("cq-perk-fav");
    expect(html).not.toContain("cq-perks-saved-toggle");
  });

  it("shows a retryable error state without leaking the error", () => {
    const html = renderScreen({ status: "error", message: "boom" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain("boom");
  });

  it("hides inactive partners and renders new partners from data", () => {
    const next = definePartner({ id: "new-shop", slug: "new-shop", name: "New Shop", categories: ["Pizza"] });
    const hidden = definePartner({ id: "hidden", slug: "hidden", name: "Hidden Shop", isActive: false });
    const html = renderScreen({ status: "ready", partners: [...PARTNER_DIRECTORY, next, hidden] });
    expect(html).toContain("New Shop");
    expect(html).not.toContain("Hidden Shop");
  });
});

describe("PartnerCard and FeaturedDealCard", () => {
  it("compact card shows Hours Unavailable when a partner has no hours", () => {
    const html = renderToStaticMarkup(
      createElement(PartnerCard, { partner: definePartner({ id: "p", slug: "p", name: "Plain" }), now: AFTERNOON, onSelect: () => {} }),
    );
    expect(html).toContain("Hours Unavailable");
    expect(html).toContain("cq-perk-status--unavailable");
    expect(html).toContain("cq-partner-media--placeholder");
  });

  it("never invents a discount for Sandbar", () => {
    const html = renderToStaticMarkup(createElement(PartnerCard, { partner: sandbar, now: AFTERNOON, onSelect: () => {} }));
    expect(html).not.toMatch(/%\s*off/i);
    expect(html).toContain("Reward soon");
  });

  it("featured card keeps the favorite button outside the media button", () => {
    const html = renderToStaticMarkup(
      createElement(FeaturedDealCard, {
        partner: daisys,
        now: AFTERNOON,
        onSelect: () => {},
        onViewReward: () => {},
        favorite: { saved: false, busy: false, disabled: false, onToggle: () => {} },
      }),
    );
    const mediaButton = html.slice(html.indexOf("cq-perk-featured__media"), html.indexOf("</button>"));
    expect(mediaButton).not.toContain("cq-perk-fav");
    expect(html).toContain(`aria-label="Save ${DAISYS_HTML}"`);
  });
});

describe("PartnerDetailView", () => {
  it("shows Daisy's hero, badge, description, status, reward, hours, address, and links", () => {
    const html = renderDetail(daisys);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('src="/partners/daisys/cover.jpg"');
    expect(html).toContain('src="/partners/daisys/logo.jpg"');
    expect(html).toContain("Verified CampusQuest Partner");
    expect(html).toContain(daisys.description!);
    expect(html).toContain("Chicken \u00b7 Ice Cream");
    expect(html).toContain("Open Now");
    expect(html).toContain("Today: 12 PM \u2013 10 PM");
    expect(html).toContain("20% OFF");
    expect(html).toContain("for URI students");
    expect(html).toContain("View Student Reward");
    expect(html).toContain("Show your CampusQuest account at checkout.");
    expect(html).toContain("106 Point Judith Rd, Narragansett, RI");
    expect(html).toContain(">Directions<");
    expect(html).toContain('href="https://daisysnarragansett.com/"');
    expect(html).not.toContain(">Menu<");
  });

  it("expands to the full weekly schedule with its source", () => {
    const collapsed = renderDetail(daisys);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toMatch(/class="cq-perk-hours__panel" hidden=""/);
    const open = renderDetail(daisys, AFTERNOON, true);
    expect(open).toContain('aria-expanded="true"');
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      expect(open).toContain(`<dt>${day}</dt>`);
    }
    expect(open).toContain("is-today");
    expect(open).toContain("checked Oct 12, 2026");
  });

  it("shows Sandbar as reward coming soon with a menu link and no website button", () => {
    const html = renderDetail(sandbar);
    expect(html).toContain("Coming soon");
    expect(html).toContain("Student reward coming soon.");
    expect(html).not.toContain("View Student Reward");
    expect(html).toContain('href="https://order.toasttab.com/online/the-sandbar-cafe-106-point-judith-road"');
    expect(html).not.toContain(">Website<");
    expect(html).toContain("Closed");
  });

  it("shows expired and temporarily unavailable rewards without a pass button", () => {
    const expired = renderDetail({ ...daisys, endsAt: "2026-10-01T00:00:00Z" });
    expect(expired).toContain("This student reward has ended.");
    expect(expired).not.toContain("View Student Reward");
    const paused = renderDetail({ ...daisys, rewardPaused: true });
    expect(paused).toContain("Temporarily unavailable");
    expect(paused).not.toContain("View Student Reward");
  });

  it("shows Hours Unavailable and hides link buttons when data is missing", () => {
    const html = renderDetail(definePartner({ id: "p", slug: "p", name: "Plain" }));
    expect(html).toContain("Hours Unavailable");
    expect(html).not.toContain(">Directions<");
    expect(html).not.toContain(">Website<");
    expect(html).not.toContain(">Menu<");
  });

  it("shows holiday notes", () => {
    const html = renderDetail({
      ...daisys,
      hours: { ...daisys.hours!, special: [{ date: "2026-10-12", label: "Columbus Day hours", intervals: [{ open: "12:00", close: "16:00" }] }] },
    });
    expect(html).toContain("Columbus Day hours");
    expect(html).toContain("Today: 12 PM \u2013 4 PM");
  });
});

const PASS: StudentRewardPass = {
  passId: "K7Q-29F",
  partnerId: daisys.id,
  partnerName: daisys.name,
  partnerLogoUrl: daisys.logoUrl,
  discountValue: "20% OFF",
  offerTitle: "for URI students",
  offerDescription: null,
  rewardTerms: null,
  redemptionInstructions: "Show your CampusQuest account at checkout.",
  verifiedLabel: "Verified URI Student",
  studentName: "Nick L.",
  issuedAt: "2026-10-12T17:00:00.000Z",
  expiresAt: "2026-10-12T17:01:00.000Z",
  serverNow: "2026-10-12T17:00:00.000Z",
};

function renderPass(state: RewardPassState): string {
  return renderToStaticMarkup(
    createElement(RewardPassView, { partner: daisys, state, clock: AFTERNOON, onClose: () => {}, onRetry: () => {} }),
  );
}

describe("RewardPassView", () => {
  it("shows the full verified pass with live indicator and validity countdown", () => {
    const html = renderPass({
      status: "active",
      pass: PASS,
      secondsLeft: 48,
      refreshing: false,
      serverNowMs: Date.parse(PASS.serverNow),
    });
    expect(html).toContain("CampusQuest");
    expect(html).toContain(DAISYS_HTML);
    expect(html).toContain('src="/partners/daisys/logo.jpg"');
    expect(html).toContain("20% OFF");
    expect(html).toContain("Verified URI Student");
    expect(html).toContain("for URI students");
    expect(html).toContain("Show this screen at checkout");
    expect(html).toContain("cq-pass__live-dot");
    expect(html).toContain("Pass K7Q-29F");
    expect(html).toContain("Valid for 48s");
    expect(html).toContain("not a payment");
    expect(html).not.toMatch(/redeemed|cryptographic|proof of identity/i);
  });

  it("shows a refreshing state", () => {
    expect(
      renderPass({ status: "active", pass: PASS, secondsLeft: 9, refreshing: true, serverNowMs: Date.parse(PASS.serverNow) }),
    ).toContain("Refreshing pass");
  });

  it("shows server time on an active pass, not the device clock", () => {
    const html = renderPass({
      status: "active",
      pass: PASS,
      secondsLeft: 48,
      refreshing: false,
      serverNowMs: Date.parse(PASS.serverNow),
    });
    expect(html).toContain('dateTime="2026-10-12T17:00:00.000Z"');
  });

  it("stops showing the pass as valid once it lapses", () => {
    const html = renderPass({ status: "lapsed", pass: PASS });
    expect(html).toContain("Pass expired");
    expect(html).toContain("Refresh pass");
    expect(html).not.toContain("Verified URI Student");
    expect(html).not.toContain("Show this screen at checkout");
    expect(html).not.toContain("cq-pass__live-dot");
  });

  it.each([
    ["login_required", "Sign in required"],
    ["verification_required", "Student verification required"],
    ["ineligible", "Not eligible"],
    ["offline", "You\u2019re offline"],
    ["error", "Something went wrong"],
    ["coming_soon", "Reward coming soon"],
    ["expired", "Offer expired"],
    ["unavailable", "Temporarily unavailable"],
  ] as const)("renders the %s state without a pass", (issue, title) => {
    const html = renderPass({ status: "issue", issue, message: null });
    expect(html).toContain(title);
    expect(html).not.toContain("Verified URI Student");
    expect(html).not.toContain("20% OFF");
    if (issue === "offline" || issue === "error") expect(html).toContain("Try again");
    else expect(html).not.toContain("Try again");
  });

  it("prefers the server's specific denial message", () => {
    const html = renderPass({
      status: "issue",
      issue: "ineligible",
      message: "Switch to your personal student profile to use student rewards.",
    });
    expect(html).toContain("Switch to your personal student profile");
  });

  it("shows a verifying state while loading", () => {
    expect(renderPass({ status: "loading" })).toContain("Verifying your student status");
  });
});

describe("SuggestBusinessForm", () => {
  it("renders the fields with optional location and reason plus a hidden honeypot", () => {
    const html = renderToStaticMarkup(createElement(SuggestBusinessForm, { onClose: () => {}, onSubmit: async () => ({ submitted: true }) }));
    expect(html).toContain("Business name");
    expect(html).toContain("Location <span class=\"cq-perk-field__optional\">optional</span>");
    expect(html).toContain("Why should we partner with them?");
    expect(html).toContain('class="cq-perk-honeypot" aria-hidden="true"');
    expect(html).toContain("Send suggestion");
  });

  it("renders the success state", () => {
    const html = renderToStaticMarkup(
      createElement(SuggestBusinessForm, { onClose: () => {}, onSubmit: async () => ({ submitted: true }), initialState: { status: "sent" } }),
    );
    expect(html).toContain("Thanks for the suggestion!");
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

  it("uses only published hours, each with a source and check date, in New York time", () => {
    for (const p of PARTNER_DIRECTORY) {
      if (!p.hours) continue;
      expect(parsePartnerHours(p.hours)).not.toBeNull();
      expect(p.hours.timeZone).toBe("America/New_York");
      expect(p.hours.source).toBeTruthy();
      expect(p.hours.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(daisys.hours?.weekly).toEqual(everyDay({ open: "12:00", close: "22:00" }));
    expect(sandbar.hours?.weekly).toEqual(everyDay({ open: "07:00", close: "12:00" }));
  });

  it("keeps Daisy's 20% OFF and does not invent a Sandbar reward or terms", () => {
    expect(daisys.discountValue).toBe("20% OFF");
    expect(daisys.rewardTerms).toBeNull();
    expect(sandbar.discountValue).toBeNull();
    expect(sandbar.offerTitle).toBeNull();
    expect(sandbar.redemptionInstructions).toBeNull();
    expect(sandbar.rewardTerms).toBeNull();
    expect(PARTNER_DIRECTORY).toHaveLength(2);
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

  it("the directory API route requires auth and serves the directory without an admin client", () => {
    const route = readFileSync(join(process.cwd(), "app/api/partners/route.ts"), "utf8");
    expect(route).toContain("requireAuthUser");
    expect(route).toContain("PARTNER_DIRECTORY");
    expect(route).not.toMatch(/service[_-]?role|createAdminClient|getSupabaseAdmin/i);
  });

  it("portals full-screen overlays to the document body", () => {
    const portal = readFileSync(join(process.cwd(), "components/partners/PartnerOverlayPortal.tsx"), "utf8");
    expect(portal).toContain("createPortal(children, document.body)");
    for (const file of ["PartnerDetailSheet.tsx", "StudentRewardPass.tsx", "SuggestBusinessSheet.tsx"]) {
      expect(readFileSync(join(process.cwd(), "components/partners", file), "utf8")).toContain("<PartnerOverlayPortal>");
    }
  });
});
