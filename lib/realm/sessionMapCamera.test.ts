import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionMapCamera,
  loadSessionMapCamera,
  saveSessionMapCamera,
} from "@/lib/realm/sessionMapCamera";

describe("sessionMapCamera", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a valid camera pose in sessionStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });

    saveSessionMapCamera({
      lat: 41.4862,
      lng: -71.5309,
      zoom: 18.5,
      heading: 12,
      tilt: 60,
    });
    expect(loadSessionMapCamera()).toEqual({
      lat: 41.4862,
      lng: -71.5309,
      zoom: 18.5,
      heading: 12,
      tilt: 60,
    });
    clearSessionMapCamera();
    expect(loadSessionMapCamera()).toBeNull();
  });

  it("rejects invalid poses", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    saveSessionMapCamera({ lat: 999, lng: 0, zoom: 18, heading: 0, tilt: 0 });
    expect(loadSessionMapCamera()).toBeNull();
  });
});
