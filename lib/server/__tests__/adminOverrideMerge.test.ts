import { describe, expect, it } from "vitest";
import { applyAdminOverrideMerge } from "@/lib/server/eventSources/upsert";

describe("applyAdminOverrideMerge", () => {
  it("preserves admin-overridden fields across sync payloads", () => {
    const incoming = {
      source: "urinvolved",
      external_id: "1",
      title: "Upstream title",
      description: "Upstream description",
      venue_name: "Union",
      starts_at: "2026-09-01T18:00:00.000Z",
    };
    const existing = {
      admin_override: true,
      admin_override_fields: ["title", "description"],
      title: "Admin title",
      description: "Admin description",
      venue_name: "Old venue",
      starts_at: "2026-08-01T18:00:00.000Z",
    };
    const merged = applyAdminOverrideMerge(incoming, existing);
    expect(merged.title).toBe("Admin title");
    expect(merged.description).toBe("Admin description");
    expect(merged.venue_name).toBe("Union");
    expect(merged.admin_override).toBe(true);
  });

  it("passes through when admin_override is false", () => {
    const incoming = { title: "Upstream", venue_name: "Ryan Center" };
    const merged = applyAdminOverrideMerge(incoming, {
      admin_override: false,
      admin_override_fields: [],
      title: "Admin",
    });
    expect(merged).toEqual(incoming);
  });
});
