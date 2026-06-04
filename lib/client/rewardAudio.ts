import { isGameMusicMuted, playLevelUpFanfare } from "@/lib/playGameSound";
import { logXpAudio } from "@/lib/client/xpAnimationDebug";
import { unlockMobileForgeAudio } from "@/lib/client/mobileXpForgeAudio";
import {
  ensureXpForgeMp3Loaded,
  isXpForgeMp3Playing,
  isXpForgeMp3Ready,
  isXpForgeMp3Unlocked,
  playXpForgeMp3,
  preloadXpForgeMp3,
  stopXpForgeMp3,
  unlockXpForgeMp3Silent,
} from "@/lib/client/xpForgeMp3";

/** Synthesized strike fallback when MP3 is not in /public/audio. */
const GAIN = {
  strike: 0.24,
  final: 0.27,
  finalLevelUp: 0.29,
  ember: 0.09,
} as const;

const REVERB_WET = 0.1;

let rewardCtx: AudioContext | null = null;
let audioUnlocked = false;
let forgeDry: GainNode | null = null;
let forgeReverb: ConvolverNode | null = null;
let forgeWet: GainNode | null = null;
let finalStrikePlayed = false;
let useMp3Fill = false;

export type XpForgeFillOptions = {
  xpGained: number;
  leveledUp?: boolean;
  segmentCount?: number;
};

type ForgeSession = {
  thresholds: number[];
  nextIndex: number;
  leveledUp: boolean;
};

type StrikeKind = "tang" | "ting" | "clank" | "tok";

let forgeSession: ForgeSession | null = null;

function isMuted(): boolean {
  return isGameMusicMuted();
}

function getOrCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!rewardCtx || rewardCtx.state === "closed") {
      rewardCtx = new AudioContext();
      forgeDry = null;
      forgeReverb = null;
      forgeWet = null;
    }
    return rewardCtx;
  } catch (e) {
    logXpAudio("audio_error", { phase: "create_context", message: String(e) });
    return null;
  }
}

function createForgeRoomImpulse(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * 0.32);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 4);
      data[i] = (Math.random() * 2 - 1) * decay * 0.18;
    }
  }
  return impulse;
}

function getForgeBus(ctx: AudioContext): { input: GainNode } {
  if (!forgeDry || !forgeReverb || !forgeWet) {
    forgeDry = ctx.createGain();
    forgeDry.gain.value = 1;
    forgeDry.connect(ctx.destination);

    forgeReverb = ctx.createConvolver();
    forgeReverb.buffer = createForgeRoomImpulse(ctx);
    forgeWet = ctx.createGain();
    forgeWet.gain.value = REVERB_WET;
    forgeReverb.connect(forgeWet);
    forgeWet.connect(ctx.destination);
  }

  const input = ctx.createGain();
  input.gain.value = 1;
  const dryTap = ctx.createGain();
  dryTap.gain.value = 0.94;
  const wetTap = ctx.createGain();
  wetTap.gain.value = 1;
  input.connect(dryTap);
  dryTap.connect(forgeDry!);
  input.connect(wetTap);
  wetTap.connect(forgeReverb!);

  return { input };
}

async function ensureRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx.state === "running";
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function impactEnvelope(gain: GainNode, t0: number, peak: number, decaySec: number): void {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.0008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.0008 + decaySec);
}

function connectForge(ctx: AudioContext, node: AudioNode): void {
  node.connect(getForgeBus(ctx).input);
}

function strikeKindForIndex(index: number): StrikeKind {
  const kinds: StrikeKind[] = ["tang", "ting", "clank", "tok"];
  return kinds[index % 4]!;
}

type ImpactProfile = {
  steelHz: number;
  steelQ: number;
  contactHz?: number;
  anvilHz: number;
  steelDecay: number;
  contactDecay?: number;
  anvilDecay: number;
};

const IMPACT: Record<StrikeKind, ImpactProfile> = {
  tang: {
    steelHz: 4400,
    steelQ: 14,
    contactHz: 2800,
    anvilHz: 340,
    steelDecay: 0.022,
    contactDecay: 0.018,
    anvilDecay: 0.03,
  },
  ting: {
    steelHz: 3900,
    steelQ: 13,
    contactHz: 2500,
    anvilHz: 380,
    steelDecay: 0.024,
    contactDecay: 0.02,
    anvilDecay: 0.032,
  },
  clank: {
    steelHz: 1250,
    steelQ: 8,
    contactHz: 880,
    anvilHz: 260,
    steelDecay: 0.028,
    contactDecay: 0.024,
    anvilDecay: 0.038,
  },
  tok: {
    steelHz: 2400,
    steelQ: 10,
    contactHz: 1650,
    anvilHz: 300,
    steelDecay: 0.025,
    contactDecay: 0.021,
    anvilDecay: 0.034,
  },
};

function playNoiseImpact(
  ctx: AudioContext,
  t0: number,
  peak: number,
  opts: {
    bufferSec: number;
    filter: BiquadFilterType;
    freq: number;
    q?: number;
    decay: number;
    gainMul?: number;
  },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, opts.bufferSec);
  const f = ctx.createBiquadFilter();
  f.type = opts.filter;
  f.frequency.value = opts.freq;
  if (opts.filter === "bandpass" && opts.q != null) {
    f.Q.value = opts.q;
  }
  const g = ctx.createGain();
  impactEnvelope(g, t0, peak * (opts.gainMul ?? 1), opts.decay);
  src.connect(f);
  f.connect(g);
  connectForge(ctx, g);
  src.start(t0);
  src.stop(t0 + opts.bufferSec + 0.02);
}

export function playAnvilStrike(
  ctx: AudioContext,
  t0: number,
  kind: StrikeKind,
  peak = GAIN.strike,
): void {
  const p = IMPACT[kind];

  playNoiseImpact(ctx, t0, peak, {
    bufferSec: 0.014,
    filter: "bandpass",
    freq: p.steelHz,
    q: p.steelQ,
    decay: p.steelDecay,
  });

  if (p.contactHz != null && p.contactDecay != null) {
    playNoiseImpact(ctx, t0 + 0.0006, peak, {
      bufferSec: 0.012,
      filter: "bandpass",
      freq: p.contactHz,
      q: p.steelQ - 2,
      decay: p.contactDecay,
      gainMul: 0.62,
    });
  }

  playNoiseImpact(ctx, t0 + 0.001, peak, {
    bufferSec: 0.02,
    filter: "lowpass",
    freq: p.anvilHz,
    decay: p.anvilDecay,
    gainMul: 0.48,
  });

  logXpAudio("forge_clink", { kind, steelHz: p.steelHz, source: "synth" });
}

export function playFinalForgeStrike(ctx: AudioContext, leveledUp = false): void {
  const t = ctx.currentTime;
  const peak = leveledUp ? GAIN.finalLevelUp : GAIN.final;
  logXpAudio("play_fill_complete", { leveledUp, type: "final_clang", source: "synth" });

  playNoiseImpact(ctx, t, peak, {
    bufferSec: 0.018,
    filter: "bandpass",
    freq: 720,
    q: 6,
    decay: 0.034,
  });

  playNoiseImpact(ctx, t + 0.001, peak, {
    bufferSec: 0.016,
    filter: "bandpass",
    freq: 1180,
    q: 7,
    decay: 0.03,
    gainMul: 0.85,
  });

  playNoiseImpact(ctx, t + 0.0015, peak, {
    bufferSec: 0.014,
    filter: "bandpass",
    freq: 3200,
    q: 11,
    decay: 0.022,
    gainMul: 0.7,
  });

  playNoiseImpact(ctx, t + 0.002, peak, {
    bufferSec: 0.024,
    filter: "lowpass",
    freq: 200,
    decay: 0.042,
    gainMul: 0.55,
  });

  finalStrikePlayed = true;
}

export function playForgeLevelUpBurst(ctx: AudioContext, t0: number): void {
  playNoiseImpact(ctx, t0, GAIN.ember, {
    bufferSec: 0.018,
    filter: "lowpass",
    freq: 520,
    decay: 0.022,
  });
  logXpAudio("forge_level_burst", { type: "ember" });
}

export function playForgeClink(
  ctx: AudioContext,
  t0: number,
  strikeIndex: number,
  variant: "normal" | "strong" = "normal",
): void {
  if (variant === "strong") {
    playFinalForgeStrike(ctx, false);
    return;
  }
  playAnvilStrike(ctx, t0, strikeKindForIndex(strikeIndex));
}

export function playForgeShing(ctx: AudioContext, leveledUp = false): void {
  playFinalForgeStrike(ctx, leveledUp);
  if (leveledUp) {
    playForgeLevelUpBurst(ctx, ctx.currentTime + 0.07);
  }
}

export function computeForgeStrikeCount(xpGained: number, segmentCount = 1): number {
  const fromXp = 3 + Math.min(4, Math.floor(Math.max(0, xpGained) / 35));
  const fromSegments = segmentCount > 1 ? 1 : 0;
  return Math.min(8, Math.max(3, fromXp + fromSegments));
}

export function forgeStrikeThresholds(strikeCount: number): number[] {
  if (strikeCount <= 1) return [0];
  return Array.from({ length: strikeCount }, (_, i) => i / (strikeCount - 1));
}

export function beginXpForgeFill(opts: XpForgeFillOptions): void {
  finalStrikePlayed = false;
  const count = computeForgeStrikeCount(opts.xpGained, opts.segmentCount ?? 1);
  forgeSession = {
    thresholds: forgeStrikeThresholds(count),
    nextIndex: 0,
    leveledUp: Boolean(opts.leveledUp),
  };
  logXpAudio("forge_session", {
    xpGained: opts.xpGained,
    strikeCount: count,
    thresholds: forgeSession.thresholds,
    leveledUp: forgeSession.leveledUp,
    source: useMp3Fill ? "mp3" : "synth",
  });
}

export function syncXpForgeFillProgress(overallT: number): void {
  if (useMp3Fill) return;
  if (!forgeSession || isMuted()) return;
  const ctx = getOrCreateContext();
  if (!ctx || ctx.state !== "running") return;

  const t = clamp01(overallT);
  const { thresholds, leveledUp } = forgeSession;

  while (forgeSession.nextIndex < thresholds.length) {
    const threshold = thresholds[forgeSession.nextIndex]!;
    if (t + 0.0005 < threshold) break;

    const strikeIndex = forgeSession.nextIndex;
    const isLast = strikeIndex === thresholds.length - 1;
    const now = ctx.currentTime;

    if (isLast) {
      playFinalForgeStrike(ctx, leveledUp);
      if (leveledUp) {
        window.setTimeout(() => {
          const c = getOrCreateContext();
          if (c?.state === "running") playForgeLevelUpBurst(c, c.currentTime);
        }, 75);
      }
    } else {
      playAnvilStrike(ctx, now, strikeKindForIndex(strikeIndex));
    }

    forgeSession.nextIndex += 1;
  }
}

export function resetXpForgeFill(): void {
  forgeSession = null;
  finalStrikePlayed = false;
}

/** Scan QR tap — unlock Web Audio + preload MP3; no audible forge. */
export async function unlockRewardAudioSilently(): Promise<boolean> {
  if (isMuted()) {
    return false;
  }

  const mp3Ok = await unlockXpForgeMp3Silent();
  void unlockMobileForgeAudio();
  useMp3Fill = mp3Ok;

  const ctx = getOrCreateContext();
  if (!ctx) {
    return mp3Ok;
  }

  try {
    if (!(await ensureRunning(ctx))) return mp3Ok;
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0;
    source.connect(g);
    g.connect(ctx.destination);
    source.start(0);
    source.stop(ctx.currentTime + 0.001);
    audioUnlocked = true;
    logXpAudio("unlock_silent_success", { state: ctx.state, mp3: mp3Ok });
    return true;
  } catch (e) {
    logXpAudio("play_failed", { reason: "unlock_silent_web_audio", error: String(e) });
    return mp3Ok;
  }
}

/** @deprecated Use unlockRewardAudioSilently on Scan QR. */
export async function unlockRewardAudio(): Promise<boolean> {
  return unlockRewardAudioSilently();
}

export function isRewardAudioUnlocked(): boolean {
  return audioUnlocked;
}

/** Audible forge during XP bar fill — call when fill animation starts only. */
export async function playXpForgeSound(opts: XpForgeFillOptions): Promise<void> {
  if (isMuted()) {
    logXpAudio("play_failed", { reason: "game_music_muted" });
    return;
  }

  logXpAudio("play_requested", {
    audioUnlocked,
    mp3Unlocked: isXpForgeMp3Unlocked(),
    mp3Ready: isXpForgeMp3Ready(),
    mp3Playing: isXpForgeMp3Playing(),
    ...opts,
  });

  resetXpForgeFill();

  const ctx = getOrCreateContext();
  if (ctx && ctx.state !== "running") {
    const running = await ensureRunning(ctx);
    if (!running) {
      logXpAudio("play_failed", { reason: "audio_context_suspended", state: ctx.state });
    }
  }

  const preloaded = await ensureXpForgeMp3Loaded();
  if (preloaded) {
    useMp3Fill = true;
    beginXpForgeFill(opts);
    const played = await playXpForgeMp3();
    if (played) {
      return;
    }
    useMp3Fill = false;
    logXpAudio("play_failed", { reason: "mp3_play_failed_fallback_synth" });
  } else {
    useMp3Fill = false;
    logXpAudio("play_failed", { reason: "mp3_preload_failed_fallback_synth" });
  }

  if (!ctx) {
    logXpAudio("play_failed", { reason: "no_audio_context_synth_skipped" });
    return;
  }

  try {
    if (!(await ensureRunning(ctx))) {
      logXpAudio("play_failed", { reason: "synth_context_not_running", state: ctx.state });
      return;
    }
    beginXpForgeFill(opts);
    logXpAudio("play_success", { source: "synth" });
  } catch (e) {
    logXpAudio("play_failed", { reason: "synth_error", error: String(e) });
  }
}

export function stopXpFillSound(): void {
  stopXpForgeSound();
}

export function stopXpForgeSound(): void {
  if (isXpForgeMp3Playing()) {
    stopXpForgeMp3();
  }
  resetXpForgeFill();
  useMp3Fill = false;
}

/** @deprecated Use playXpForgeSound */
export const playXpFillSound = playXpForgeSound;

export type XpForgeCompleteOptions = {
  leveledUp?: boolean;
};

export async function playXpCompleteSound(opts?: XpForgeCompleteOptions): Promise<void> {
  if (isMuted()) return;
  logXpAudio("play_complete", { leveledUp: opts?.leveledUp, skipped: finalStrikePlayed, mp3: useMp3Fill });

  if (useMp3Fill) {
    stopXpForgeMp3();
    resetXpForgeFill();
    return;
  }

  const ctx = getOrCreateContext();
  if (!ctx) return;

  try {
    if (!(await ensureRunning(ctx))) return;
    if (finalStrikePlayed) {
      if (opts?.leveledUp) {
        playForgeLevelUpBurst(ctx, ctx.currentTime);
      }
      return;
    }
    playFinalForgeStrike(ctx, Boolean(opts?.leveledUp));
    if (opts?.leveledUp) {
      playForgeLevelUpBurst(ctx, ctx.currentTime + 0.07);
    }
  } catch (e) {
    logXpAudio("audio_error", { phase: "play_complete", message: String(e) });
  }
  resetXpForgeFill();
}

export function playLevelUpRewardSound(): void {
  if (isMuted()) return;
  stopXpFillSound();
  playLevelUpFanfare();
}

export function playXpFillStart(_ctx: AudioContext): void {}

export function playXpFillComplete(ctx: AudioContext, leveledUp = false): void {
  playFinalForgeStrike(ctx, leveledUp);
  if (leveledUp) playForgeLevelUpBurst(ctx, ctx.currentTime + 0.07);
}

export { XP_FORGE_AUDIO_ALT_URLS, XP_FORGE_AUDIO_URL } from "@/lib/client/xpForgeMp3";
