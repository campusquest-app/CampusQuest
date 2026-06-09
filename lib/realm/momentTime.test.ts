import { describe, expect, it } from "vitest";
import { formatExpiresIn, formatPostedAgo } from "@/lib/realm/momentTime";

describe("momentTime", () => {
  const now = Date.parse("2026-05-29T12:00:00.000Z");

  it("formats posted ago labels", () => {
    expect(formatPostedAgo("2026-05-29T11:58:00.000Z", now)).toBe("2m ago");
    expect(formatPostedAgo("2026-05-29T10:00:00.000Z", now)).toBe("2h ago");
    expect(formatPostedAgo("2026-05-28T12:00:00.000Z", now)).toBe("Yesterday");
  });

  it("formats expires in labels", () => {
    expect(formatExpiresIn("2026-05-29T12:30:00.000Z", now)).toBe("Expires in 30m");
    expect(formatExpiresIn("2026-05-30T10:00:00.000Z", now)).toBe("Expires in 22h");
    expect(formatExpiresIn("2026-05-29T11:00:00.000Z", now)).toBe("Expired");
  });
});
