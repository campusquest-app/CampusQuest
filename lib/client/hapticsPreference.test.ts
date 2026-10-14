import { afterEach, describe, expect, it, vi } from "vitest";
import { isHapticsEnabled, pulseHaptic, setHapticsEnabled } from "@/lib/client/hapticsPreference";

function installStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  return store;
}

describe("haptics preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays on until the user stores off, then pulse is skipped", () => {
    installStorage();
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    expect(isHapticsEnabled()).toBe(true);
    pulseHaptic(12);
    expect(vibrate).toHaveBeenCalledWith(12);
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    pulseHaptic(12);
    expect(vibrate).toHaveBeenCalledTimes(1);
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
  });
});
