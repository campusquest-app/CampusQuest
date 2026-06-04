import { logXpAudio } from "@/lib/client/xpAnimationDebug";

/** Primary forge SFX — public/audio/xpforgesound.mp3 */
export const XP_FORGE_AUDIO_URL = "/audio/xpforgesound.mp3";

/** Legacy / alternate filenames under public/audio/ */
export const XP_FORGE_AUDIO_ALT_URLS = ["/audio/xp-forge.mp3", "/audio/xploadingsound.mp3"] as const;

const FILL_VOLUME = 0.26;

let forgeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
let mp3Available: boolean | null = null;
let mp3Unlocked = false;
let mp3Playing = false;

function canUseDomAudio(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

function attachForgeAudio(url: string): HTMLAudioElement {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = FILL_VOLUME;
  audio.loop = true;
  return audio;
}

/** HEAD check — logs exact path when missing. */
export async function verifyXpForgeAudioFile(url: string): Promise<boolean> {
  logXpAudio("file_path", { path: url });
  if (typeof window === "undefined") return false;
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (res.ok) {
      logXpAudio("file_exists", { path: url, status: res.status });
      return true;
    }
    logXpAudio("preload_failed", {
      path: url,
      status: res.status,
      reason: "http_not_ok",
    });
    return false;
  } catch (e) {
    logXpAudio("preload_failed", {
      path: url,
      reason: "fetch_failed",
      error: String(e),
    });
    return false;
  }
}

async function resolveForgeAudioUrl(): Promise<string> {
  const candidates = [XP_FORGE_AUDIO_URL, ...XP_FORGE_AUDIO_ALT_URLS];
  for (const url of candidates) {
    if (await verifyXpForgeAudioFile(url)) return url;
  }
  logXpAudio("preload_failed", {
    reason: "no_candidate_file",
    tried: candidates,
  });
  return XP_FORGE_AUDIO_URL;
}

/** Load MP3 into memory — no audible playback. */
export async function preloadXpForgeMp3(): Promise<boolean> {
  if (!canUseDomAudio()) return false;
  if (mp3Available === true && forgeAudio) return true;
  if (mp3Available === false) return false;

  const resolvedUrl = await resolveForgeAudioUrl();
  const candidates = [
    resolvedUrl,
    ...[XP_FORGE_AUDIO_URL, ...XP_FORGE_AUDIO_ALT_URLS].filter((u) => u !== resolvedUrl),
  ];

  for (const url of candidates) {
    if (!forgeAudio || activeUrl !== url) {
      forgeAudio = attachForgeAudio(url);
      activeUrl = url;
    }

    forgeAudio.load();

    const loaded = await new Promise<boolean>((resolve) => {
      if (!forgeAudio) {
        resolve(false);
        return;
      }
      if (forgeAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && !forgeAudio.error) {
        resolve(true);
        return;
      }
      const finish = (ok: boolean) => resolve(ok);
      const onReady = () => finish(!forgeAudio?.error);
      const onError = () => finish(false);
      forgeAudio.addEventListener("canplaythrough", onReady, { once: true });
      forgeAudio.addEventListener("error", onError, { once: true });
      window.setTimeout(
        () => finish(Boolean(forgeAudio && !forgeAudio.error && forgeAudio.readyState >= 2)),
        3000,
      );
    });

    if (loaded && forgeAudio && !forgeAudio.error) {
      mp3Available = true;
      logXpAudio("preload_success", { url });
      return true;
    }
  }

  mp3Available = false;
  logXpAudio("preload_failed", {
    reason: "element_not_ready",
    tried: candidates,
  });
  return false;
}

/**
 * iOS unlock — muted play/pause only (no audible forge sound).
 * Call from Scan QR tap.
 */
export async function unlockXpForgeMp3Silent(): Promise<boolean> {
  const ready = await preloadXpForgeMp3();
  if (!ready || !forgeAudio) return false;

  try {
    forgeAudio.muted = true;
    forgeAudio.volume = 0;
    const playPromise = forgeAudio.play();
    if (playPromise) await playPromise;
    forgeAudio.pause();
    forgeAudio.currentTime = 0;
    forgeAudio.muted = false;
    forgeAudio.volume = FILL_VOLUME;
    mp3Unlocked = true;
    logXpAudio("unlock_success", { url: activeUrl });
    return true;
  } catch (e) {
    if (forgeAudio) {
      forgeAudio.muted = false;
      forgeAudio.volume = FILL_VOLUME;
    }
    logXpAudio("play_failed", { reason: "unlock_silent_rejected", error: String(e) });
    return false;
  }
}

export function isXpForgeMp3Ready(): boolean {
  return mp3Available === true;
}

export function isXpForgeMp3Unlocked(): boolean {
  return mp3Unlocked;
}

export function isXpForgeMp3Playing(): boolean {
  return mp3Playing;
}

/** Audible forge loop — only when XP fill starts. */
export async function playXpForgeMp3(): Promise<boolean> {
  logXpAudio("play_requested", { url: activeUrl });

  const ready = await preloadXpForgeMp3();
  if (!ready || !forgeAudio) {
    logXpAudio("play_failed", {
      reason: "not_preloaded",
      mp3Available,
      url: activeUrl,
    });
    return false;
  }

  try {
    forgeAudio.muted = false;
    forgeAudio.volume = FILL_VOLUME;
    forgeAudio.currentTime = 0;
    forgeAudio.loop = true;
    await forgeAudio.play();
    mp3Playing = true;
    logXpAudio("play_success", { url: activeUrl, volume: forgeAudio.volume });
    return true;
  } catch (e) {
    mp3Playing = false;
    logXpAudio("play_failed", {
      reason: "play_rejected",
      error: String(e),
      unlocked: mp3Unlocked,
      volume: forgeAudio.volume,
      muted: forgeAudio.muted,
      url: activeUrl,
    });
    return false;
  }
}

export function stopXpForgeMp3(): void {
  if (!forgeAudio) return;
  forgeAudio.pause();
  forgeAudio.currentTime = 0;
  forgeAudio.loop = false;
  forgeAudio.muted = false;
  forgeAudio.volume = FILL_VOLUME;
  mp3Playing = false;
  logXpAudio("stop_requested", { url: activeUrl });
}

/** @deprecated Use unlockXpForgeMp3Silent */
export async function unlockXpForgeMp3(): Promise<boolean> {
  return unlockXpForgeMp3Silent();
}

/** @deprecated Use preloadXpForgeMp3 */
export const ensureXpForgeMp3Loaded = preloadXpForgeMp3;
