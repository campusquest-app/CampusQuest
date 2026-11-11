import { describe, expect, it } from "vitest";
import { businessLogoFileError } from "@/lib/businessLogoFile";

describe("business logo files", () => {
  it("accepts a reasonably sized jpeg, png, or webp", () => {
    expect(businessLogoFileError({ type: "image/png", size: 1200 })).toBeNull();
    expect(businessLogoFileError({ type: "image/webp", size: 1200 })).toBeNull();
    expect(businessLogoFileError({ type: "image/jpeg", size: 1200 })).toBeNull();
  });

  it("rejects unsupported formats and oversized files", () => {
    expect(businessLogoFileError({ type: "image/gif", size: 1200 })).toMatch(/JPEG, PNG, or WebP/);
    expect(businessLogoFileError({ type: "image/png", size: 26 * 1024 * 1024 })).toMatch(/too large/);
  });
});
