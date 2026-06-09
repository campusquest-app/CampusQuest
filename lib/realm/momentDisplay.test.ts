import { describe, expect, it } from "vitest";
import { avatarPayloadForDisplay, getMomentCaption, safeMomentText } from "@/lib/realm/momentDisplay";

describe("momentDisplay", () => {
  it("coerces captions to strings only", () => {
    expect(safeMomentText("  hello  ")).toBe("hello");
    expect(safeMomentText({ body: "nope" })).toBe("");
    expect(safeMomentText(null, "fallback")).toBe("fallback");
  });

  it("never returns raw avatar JSON blobs for display", () => {
    const blob = 'ed: abc options: { backgroundColor: ["041e42"] }';
    expect(avatarPayloadForDisplay(blob)).toBe("🎓");
    expect(avatarPayloadForDisplay('{"v":2,"style":"lorelei","seed":"test","options":{}}')).not.toContain("options:");
  });

  it("returns caption only when string", () => {
    expect(getMomentCaption({ caption: "Hello campus" })).toBe("Hello campus");
    expect(getMomentCaption({ caption: { body: "nope" } })).toBe("");
  });

  it("keeps parseable dicebear avatars", () => {
    const dicebear = JSON.stringify({
      v: 2,
      style: "lorelei",
      seed: "campusquest-default-avatar",
      options: { backgroundColor: ["041e42"] },
    });
    expect(avatarPayloadForDisplay(dicebear)).toBe(dicebear);
  });
});
