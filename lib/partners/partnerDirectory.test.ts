import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARTNER_DIRECTORY } from "@/lib/partners/partnerDirectory";
import { parsePartnerHours } from "@/lib/partners/partnerHours";

/** Same pattern as the partner_id check constraints in the student perks migration. */
const PARTNER_ID = /^[a-z0-9-]{1,80}$/;

describe("partner directory integrity", () => {
  it("uses unique ids and slugs that the database accepts", () => {
    const ids = PARTNER_DIRECTORY.map((p) => p.id);
    const slugs = PARTNER_DIRECTORY.map((p) => p.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const id of ids) expect(id).toMatch(PARTNER_ID);
  });

  it("only lists hours that parse cleanly and cite where they came from", () => {
    for (const partner of PARTNER_DIRECTORY) {
      if (!partner.hours) continue;
      expect(parsePartnerHours(partner.hours), partner.id).not.toBeNull();
      expect(partner.hours.source?.trim(), partner.id).toBeTruthy();
      expect(partner.hours.checkedOn, partner.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gives every discount a title and redemption instructions, and valid offer dates", () => {
    for (const partner of PARTNER_DIRECTORY) {
      if (!partner.discountValue) continue;
      expect(partner.offerTitle, partner.id).toBeTruthy();
      expect(partner.redemptionInstructions, partner.id).toBeTruthy();
      for (const date of [partner.startsAt, partner.endsAt]) {
        if (date) expect(Number.isFinite(Date.parse(date)), partner.id).toBe(true);
      }
      if (partner.startsAt && partner.endsAt) {
        expect(Date.parse(partner.startsAt), partner.id).toBeLessThan(Date.parse(partner.endsAt));
      }
    }
  });

  it("points local images at files that exist", () => {
    for (const partner of PARTNER_DIRECTORY) {
      for (const url of [partner.logoUrl, partner.coverImageUrl]) {
        if (!url || !url.startsWith("/")) continue;
        expect(existsSync(join(process.cwd(), "public", url)), `${partner.id} ${url}`).toBe(true);
      }
    }
  });
});
