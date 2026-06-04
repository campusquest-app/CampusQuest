import { logMobileAudio } from "@/lib/client/mobileXpAnimationDebug";
import { logXpAudio } from "@/lib/client/xpAnimationDebug";
import { isGameMusicMuted } from "@/lib/playGameSound";
import {
  preloadXpForgeMp3,
  playXpForgeMp3,
  stopXpForgeMp3,
  unlockXpForgeMp3Silent,
  verifyXpForgeAudioFile,
  XP_FORGE_AUDIO_ALT_URLS,
  XP_FORGE_AUDIO_URL,
} from "@/lib/client/xpForgeMp3";

const FILL_VOLUME = 0.26;

let mobileCtx: AudioContext | null = null;
let forgeBuffer: AudioBuffer | null = null;
let bufferSource: AudioBufferSourceNode | null = null;
let bufferGain: GainNode | null = null;
let bufferPlaying = false;
let mobileUnlocked = false;

function getMobileCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!mobileCtx || mobileCtx.state === "closed") {
      mobileCtx = new AudioContext();
    }
    return mobileCtx;
  } catch {
    return null;
  }
}

async function ensureCtxRunning(): Promise<AudioContext | null> {
  const ctx = getMobileCtx();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch (e) {
      logXpAudio("fallback_failed", { reason: "context_resume", error: String(e) });
      return null;
    }
  }
  return ctx.state === "running" ? ctx : null;
}

async function resolveBufferUrl(): Promise<string | null> {
  if (await verifyXpForgeAudioFile(XP_FORGE_AUDIO_URL)) return XP_FORGE_AUDIO_URL;
  for (const alt of XP_FORGE_AUDIO_ALT_URLS) {
    if (await verifyXpForgeAudioFile(alt)) return alt;
  }
  return null;
}

async function decodeForgeBuffer(): Promise<AudioBuffer | null> {
  if (forgeBuffer) return forgeBuffer;
  const ctx = getMobileCtx();
  if (!ctx) return null;

  const url = await resolveBufferUrl();
  if (!url) return null;

  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) {
      logXpAudio("fallback_failed", { reason: "fetch_failed", status: res.status, url });
      return null;
    }
    const data = await res.arrayBuffer();
    forgeBuffer = await ctx.decodeAudioData(data.slice(0));
    logXpAudio("preload_success", { url, duration: forgeBuffer.duration, source: "buffer" });
    return forgeBuffer;
  } catch (e) {
    logXpAudio("fallback_failed", { reason: "decode_failed", error: String(e), url });
    return null;
  }
}

function stopBufferPlayback(): void {
  try {
    bufferSource?.stop();
  } catch {
    /* already stopped */
  }
  bufferSource?.disconnect();
  bufferGain?.disconnect();
  bufferSource = null;
  bufferGain = null;
  bufferPlaying = false;
}

/** Scan QR — silent unlock + preload HTML + decode buffer. No audible forge. */
export async function unlockMobileForgeAudio(): Promise<boolean> {
  if (isGameMusicMuted()) return false;

  const htmlOk = await unlockXpForgeMp3Silent();
  await preloadXpForgeMp3();
  const buf = await decodeForgeBuffer();
  const ctx = await ensureCtxRunning();
  if (ctx) {
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + 0.001);
    mobileUnlocked = true;
    logXpAudio("unlock_success", { html: htmlOk, buffer: Boolean(buf), state: ctx.state });
    logMobileAudio("unlock_success", { html: htmlOk, buffer: Boolean(buf) });
    return true;
  }
  mobileUnlocked = htmlOk;
  logXpAudio("unlock_success", { html: htmlOk, buffer: Boolean(buf), webAudio: false });
  return htmlOk || Boolean(buf);
}

export async function preloadMobileForgeAudio(): Promise<boolean> {
  const html = await preloadXpForgeMp3();
  const buf = await decodeForgeBuffer();
  return html || Boolean(buf);
}

/** Play at mobile RAF fill start — HTML audio first, then buffer loop. */
export async function playMobileForgeSound(): Promise<boolean> {
  if (isGameMusicMuted()) {
    logXpAudio("play_requested", { skipped: true, reason: "muted" });
    return false;
  }

  logXpAudio("play_requested", { unlocked: mobileUnlocked });

  if (!mobileUnlocked) {
    await unlockMobileForgeAudio();
  }

  const htmlPlayed = await playXpForgeMp3();
  if (htmlPlayed) {
    logXpAudio("play_success", { source: "html", url: XP_FORGE_AUDIO_URL });
    return true;
  }

  logXpAudio("play_failed", { source: "html", url: XP_FORGE_AUDIO_URL });

  const ctx = await ensureCtxRunning();
  const buffer = await decodeForgeBuffer();
  if (!ctx || !buffer) {
    logXpAudio("fallback_failed", { reason: "no_context_or_buffer" });
    return false;
  }

  try {
    stopBufferPlayback();
    stopXpForgeMp3();

    bufferSource = ctx.createBufferSource();
    bufferGain = ctx.createGain();
    bufferGain.gain.value = FILL_VOLUME;
    bufferSource.buffer = buffer;
    bufferSource.loop = true;
    bufferSource.connect(bufferGain);
    bufferGain.connect(ctx.destination);
    bufferSource.start(0);
    bufferPlaying = true;
    logXpAudio("fallback_success", { duration: buffer.duration });
    return true;
  } catch (e) {
    logXpAudio("fallback_failed", { reason: "buffer_source_start", error: String(e) });
    return false;
  }
}

export function stopMobileForgeSound(): void {
  stopXpForgeMp3();
  stopBufferPlayback();
}

export function isMobileForgePlaying(): boolean {
  return bufferPlaying;
}
