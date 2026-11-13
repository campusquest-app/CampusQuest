import { describe, expect, it } from "vitest";
import { recordBusinessViews } from "@/lib/server/partnerEngagement";

describe("recordBusinessViews", () => {
  it("writes one row per business per visit and ignores a retry", async () => {
    const rows: { partner_id: string; visit_id: string; event_type: string }[] = [];
    const admin = {
      from(table: string) {
        expect(table).toBe("partner_engagement_events");
        return {
          upsert(
            values: { partner_id: string; visit_id: string; event_type: string }[],
            options: { onConflict: string; ignoreDuplicates: boolean },
          ) {
            expect(options).toEqual({ onConflict: "visit_id,partner_id", ignoreDuplicates: true });
            expect(values.map((row) => row.partner_id)).toEqual(["daisys-chicken-ice-cream", "the-sandbar-cafe"]);
            for (const row of values) {
              if (rows.some((existing) => existing.visit_id === row.visit_id && existing.partner_id === row.partner_id)) {
                continue;
              }
              rows.push(row);
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    const visit = {
      userId: "student-1",
      visitId: "11111111-1111-4111-8111-111111111111",
      partnerIds: ["daisys-chicken-ice-cream", "daisys-chicken-ice-cream", "the-sandbar-cafe"],
    };
    // Narrow mock — same pattern as partnerRewards.test.ts (`as never`).
    await recordBusinessViews(admin as never, visit);
    await recordBusinessViews(admin as never, visit);
    await recordBusinessViews(admin as never, { ...visit, visitId: "22222222-2222-4222-8222-222222222222" });

    const count = (partnerId: string) => rows.filter((row) => row.partner_id === partnerId).length;
    expect(count("daisys-chicken-ice-cream")).toBe(2);
    expect(count("the-sandbar-cafe")).toBe(2);
    expect(rows.every((row) => row.event_type === "business_view")).toBe(true);
  });
});
