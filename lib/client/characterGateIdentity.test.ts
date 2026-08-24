import { describe, expect, it } from "vitest";
import { resolveCharacterGateIdentity } from "@/lib/client/characterGateIdentity";

describe("resolveCharacterGateIdentity", () => {
  it("preserves the signup username and uses existing display_name", () => {
    const resolved = resolveCharacterGateIdentity({
      username: "alex_rhody",
      display_name: "Alex",
    });
    expect(resolved.username).toBe("alex_rhody");
    expect(resolved.displayName).toBe("Alex");
    expect(resolved.usernameValid).toBe(true);
    expect(resolved.displayNameValid).toBe(true);
  });

  it("defaults display name from username when display_name is empty", () => {
    const resolved = resolveCharacterGateIdentity({
      username: "alex_rhody",
      display_name: null,
    });
    expect(resolved.username).toBe("alex_rhody");
    expect(resolved.displayName).toBe("alex rhody");
    expect(resolved.displayNameValid).toBe(true);
  });

  it("does not invent a second username when one already exists", () => {
    const resolved = resolveCharacterGateIdentity({
      username: "nicklockhart22",
      display_name: "nlockhart22",
    });
    expect(resolved.username).toBe("nicklockhart22");
    expect(resolved.username).not.toBe(resolved.displayName.toLowerCase().replace(/\s+/g, "_"));
  });
});
