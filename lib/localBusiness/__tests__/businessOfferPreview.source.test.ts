import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const screen = readFileSync(join(process.cwd(), "components/localBusiness/BusinessProfileScreen.tsx"), "utf8");
const rewards = readFileSync(join(process.cwd(), "lib/server/partnerRewards.ts"), "utf8");
const openMembership = readFileSync(join(process.cwd(), "lib/partners/openMembershipRewards.ts"), "utf8");

describe("business offer Preview Coupon", () => {
  it("exposes Preview Coupon beside live offers for authorized managers", () => {
    expect(screen).toContain("Preview Coupon");
    expect(screen).toContain("setPreviewingOffer(true)");
    expect(screen).toContain("<StudentRewardPass");
    expect(screen).toContain("isOwner && previewPartner");
  });

  it("issues a view-only preview without engagement logging", () => {
    expect(rewards).toContain("businessPreview");
    expect(rewards).toContain("PREV-");
    expect(rewards).toContain('preview: true');
    expect(rewards).toContain("actorManagesPartner");
    expect(rewards).toMatch(/if \(!args\.refresh && !viewOnlyPreview\)[\s\S]*recordPartnerEngagement/);
  });

  it("keeps International Pocket Café on the open-membership allowlist", () => {
    expect(openMembership).toContain("international-pocket-cafe");
    expect(openMembership).toContain("Available to all CampusQuest members");
  });
});
