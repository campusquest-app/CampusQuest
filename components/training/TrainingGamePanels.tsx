"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { StatKey } from "@/lib/types";
import { getStatTrainingPercent } from "@/lib/trainingGroundsCatalog";

const REP_TOTAL = 4;
const SPRINT_MS = 3000;
const DODGE_MS = 6000;

export type TrainingGameModifiers = {
  strengthPct: number;
  staminaPct: number;
  knowledgePct: number;
  socialPct: number;
  focusPct: number;
};

export function defaultTrainingModifiers(stats: Record<StatKey, number>): TrainingGameModifiers {
  return {
    strengthPct: getStatTrainingPercent("strength", stats.strength),
    staminaPct: getStatTrainingPercent("stamina", stats.stamina),
    knowledgePct: getStatTrainingPercent("knowledge", stats.knowledge),
    socialPct: getStatTrainingPercent("social", stats.social),
    focusPct: getStatTrainingPercent("focus", stats.focus),
  };
}

function RepTimingPanel({
  onDone,
  onCancel,
  greenExpand = 0,
}: {
  onDone: (xp: number) => void;
  onCancel: () => void;
  greenExpand?: number;
}) {
  const greenMin = Math.max(0.32, 0.4 - greenExpand * 0.004);
  const greenMax = Math.min(0.72, 0.62 + greenExpand * 0.004);
  const [rep, setRep] = useState(0);
  const [perfect, setPerfect] = useState(0);
  const posRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();
    const loop = () => {
      const t = (performance.now() - startRef.current) / 1000;
      posRef.current = (Math.sin(t * Math.PI * 1.15) + 1) / 2;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const [, setHud] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setHud((x) => x + 1), 32);
    return () => clearInterval(id);
  }, []);

  const p = posRef.current;
  const inGreen = p >= greenMin && p <= greenMax;

  const tap = () => {
    if (rep >= REP_TOTAL) return;
    const ok = posRef.current >= greenMin && posRef.current <= greenMax;
    const nextPerfect = perfect + (ok ? 1 : 0);
    setPerfect(nextPerfect);
    const next = rep + 1;
    setRep(next);
    if (next >= REP_TOTAL) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const xp = nextPerfect === REP_TOTAL ? 25 : nextPerfect >= 2 ? 16 : 10;
      onDone(xp);
    }
  };

  return (
    <div className="cq-training-game-panel rounded-2xl border border-amber-500/35 bg-black/40 p-4 space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-white">Forge of Strength</p>
        <button type="button" onClick={onCancel} className="text-xs text-white/50 hover:text-white">
          Retreat
        </button>
      </div>
      <p className="text-xs text-white/55">Strike when the hammer sits in the glowing forge zone. {REP_TOTAL} strikes.</p>
      <div className="relative h-14 rounded-xl bg-white/10 border border-white/15 overflow-hidden">
        <div
          className="absolute inset-y-2 rounded-lg bg-emerald-500/35 border border-emerald-400/50"
          style={{ left: `${greenMin * 100}%`, right: `${(1 - greenMax) * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-9 rounded-md bg-uri-gold shadow-[0_0_12px_rgba(197,160,40,0.6)] -ml-1.5"
          style={{ left: `${p * 100}%` }}
        />
      </div>
      <p className="text-center text-xs font-mono text-white/70">
        Strike {Math.min(rep + 1, REP_TOTAL)}/{REP_TOTAL} · Perfect {perfect}
        {inGreen ? <span className="text-emerald-300 ml-2">· FORGED</span> : null}
      </p>
      <button
        type="button"
        onClick={tap}
        className="w-full py-4 rounded-xl bg-gradient-to-b from-amber-600/90 to-amber-800/90 text-white font-black text-lg border border-amber-400/40 active:scale-[0.98]"
      >
        STRIKE!
      </button>
    </div>
  );
}

function SprintTapPanel({
  onDone,
  onCancel,
  bonusMs = 0,
}: {
  onDone: (xp: number) => void;
  onCancel: () => void;
  bonusMs?: number;
}) {
  const durationMs = SPRINT_MS + bonusMs;
  const [phase, setPhase] = useState<"ready" | "go" | "done">("ready");
  const [taps, setTaps] = useState(0);
  const [left, setLeft] = useState(durationMs);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const tapsRef = useRef(0);
  const scoredRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = () => {
    scoredRef.current = false;
    tapsRef.current = 0;
    setTaps(0);
    setPhase("go");
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const l = Math.max(0, durationMs - elapsed);
      setLeft(l);
      if (l <= 0) {
        stop();
        setPhase("done");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (phase !== "done" || scoredRef.current) return;
    scoredRef.current = true;
    onDone(Math.min(28, Math.max(8, 6 + Math.floor(tapsRef.current * 0.65))));
  }, [phase, onDone]);

  if (phase === "ready") {
    return (
      <div className="cq-training-game-panel rounded-2xl border border-teal-500/35 bg-black/40 p-4 space-y-3">
        <div className="flex justify-between">
          <p className="text-sm font-bold text-white">Path of Stamina</p>
          <button type="button" onClick={onCancel} className="text-xs text-white/50 hover:text-white">
            Retreat
          </button>
        </div>
        <p className="text-xs text-white/55">Sprint the campus trail — tap fast for {(durationMs / 1000).toFixed(1)} seconds.</p>
        <button type="button" onClick={start} className="w-full py-3 rounded-xl bg-teal-600/90 text-white font-bold text-sm hover:bg-teal-500">
          Run!
        </button>
      </div>
    );
  }

  if (phase === "go") {
    return (
      <div className="cq-training-game-panel rounded-2xl border border-teal-500/35 bg-black/40 p-4 space-y-3">
        <p className="text-center text-xs font-mono text-white/70">{(left / 1000).toFixed(2)}s · Taps {taps}</p>
        <button
          type="button"
          onClick={() => {
            tapsRef.current += 1;
            setTaps((t) => t + 1);
          }}
          className="w-full py-14 rounded-2xl bg-gradient-to-br from-teal-600/50 to-uri-navy border-2 border-teal-400/40 text-white font-black text-xl active:scale-[0.98]"
        >
          SPRINT!
        </button>
      </div>
    );
  }

  return <p className="text-xs text-uri-gold text-center py-4">Scoring your run…</p>;
}

const QUIZ_BANK: { q: string; options: string[]; correct: number }[] = [
  { q: "What is 7 × 8?", options: ["54", "56", "63"], correct: 1 },
  { q: "Capital of Rhode Island?", options: ["Newport", "Providence", "Warwick"], correct: 1 },
  { q: "H2O is commonly known as…", options: ["Oxygen", "Water", "Salt"], correct: 1 },
  { q: "How many days in a leap-year February?", options: ["28", "29", "30"], correct: 1 },
  { q: 'Synonym for "brief"?', options: ["Verbose", "Concise", "Ancient"], correct: 1 },
  { q: "CPU stands for…", options: ["Central processing unit", "Computer personal unit", "Core power utility"], correct: 0 },
];

function KnowledgeQuizPanel({
  onDone,
  onCancel,
}: {
  onDone: (xp: number) => void;
  onCancel: () => void;
  correctBonusPct?: number;
}) {
  const [idx, setIdx] = useState(0);
  const [wrongFeedback, setWrongFeedback] = useState<{ correctText: string; chosenText: string } | null>(null);
  const totalRef = useRef(0);
  const pair = useMemo(() => {
    const shuffled = [...QUIZ_BANK].sort(() => Math.random() - 0.5);
    return [shuffled[0]!, shuffled[1]!] as [(typeof QUIZ_BANK)[0], (typeof QUIZ_BANK)[0]];
  }, []);
  const correctXp = 20;

  const cur = pair[idx];
  if (!cur) return null;

  const advanceOrFinish = () => {
    if (idx >= 1) {
      onDone(totalRef.current);
      return;
    }
    setIdx(1);
  };

  const pick = (i: number) => {
    const correct = i === cur.correct;
    totalRef.current += correct ? correctXp : 5;
    if (!correct) {
      setWrongFeedback({
        correctText: cur.options[cur.correct] ?? "",
        chosenText: cur.options[i] ?? "",
      });
      return;
    }
    advanceOrFinish();
  };

  return (
    <div className="cq-training-game-panel rounded-2xl border border-sky-500/35 bg-black/40 p-4 space-y-3">
      <div className="flex justify-between">
        <p className="text-sm font-bold text-white">Archives of Knowledge</p>
        <button type="button" onClick={onCancel} className="text-xs text-white/50 hover:text-white">
          Retreat
        </button>
      </div>
      {wrongFeedback ? (
        <>
          <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-200/95">Not quite.</p>
            <p className="text-sm text-white/90">
              Correct: <span className="font-semibold text-emerald-300">{wrongFeedback.correctText}</span>
            </p>
          </div>
          <button type="button" onClick={() => { setWrongFeedback(null); advanceOrFinish(); }} className="w-full py-2.5 rounded-xl bg-uri-keaney/80 text-white text-sm font-bold">
            Continue
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-white/55">Question {idx + 1}/2 · Correct +{correctXp} XP</p>
          <p className="text-sm text-white font-medium leading-snug">{cur.q}</p>
          <div className="space-y-2">
            {cur.options.map((opt, i) => (
              <button key={i} type="button" onClick={() => pick(i)} className="w-full text-left py-2.5 px-3 rounded-lg border border-white/15 bg-white/[0.06] text-sm text-white/90 hover:bg-sky-500/15">
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const SOCIAL_SCENARIOS: {
  prompt: string;
  choices: { text: string; tier: "best" | "ok" | "weak" }[];
}[] = [
  {
    prompt: "You meet someone at a career fair. They ask what you're studying. You want to sound confident.",
    choices: [
      { text: "Share your major, one concrete project, and ask what drew them to the fair.", tier: "best" },
      { text: "Give your major only and wait.", tier: "ok" },
      { text: "Apologize for bothering them and walk away.", tier: "weak" },
    ],
  },
  {
    prompt: "A classmate forgot the assignment deadline. They DM you last minute.",
    choices: [
      { text: "Share the deadline kindly and offer one quick tip if you have time.", tier: "best" },
      { text: "Reply with only the due date.", tier: "ok" },
      { text: "Ignore the message.", tier: "weak" },
    ],
  },
];

function SocialMatchPanel({
  onDone,
  onCancel,
}: {
  onDone: (xp: number) => void;
  onCancel: () => void;
  socialBonusPct?: number;
}) {
  const scenario = useMemo(() => SOCIAL_SCENARIOS[Math.floor(Math.random() * SOCIAL_SCENARIOS.length)]!, []);
  const xpFor: Record<string, number> = { best: 25, ok: 10, weak: 8 };

  return (
    <div className="cq-training-game-panel rounded-2xl border border-emerald-500/35 bg-black/40 p-4 space-y-3">
      <div className="flex justify-between">
        <p className="text-sm font-bold text-white">Hall of Influence</p>
        <button type="button" onClick={onCancel} className="text-xs text-white/50 hover:text-white">
          Retreat
        </button>
      </div>
      <p className="text-sm text-white/90 leading-relaxed">{scenario.prompt}</p>
      <div className="space-y-2">
        {scenario.choices.map((c, i) => (
          <button key={i} type="button" onClick={() => onDone(xpFor[c.tier])} className="w-full text-left py-2.5 px-3 rounded-lg border border-white/15 bg-white/[0.06] text-sm text-white/90 hover:bg-emerald-500/15">
            {c.text}
          </button>
        ))}
      </div>
    </div>
  );
}

type Obstacle = { id: number; lane: number; y: number };
const DODGE_LANES = 3;

function FocusDodgePanel({
  onDone,
  onCancel,
  hitForgiveness = 1,
}: {
  onDone: (xp: number) => void;
  onCancel: () => void;
  hitForgiveness?: number;
}) {
  const [lane, setLane] = useState(1);
  const [hits, setHits] = useState(0);
  const [done, setDone] = useState(false);
  const [, setTick] = useState(0);
  const obsRef = useRef<Obstacle[]>([]);
  const nextId = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const laneRef = useRef(lane);
  laneRef.current = lane;

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => {
    startRef.current = performance.now();
    let frame = 0;
    const step = () => {
      frame++;
      if (frame % 2 === 0) setTick((t) => t + 1);
      if (performance.now() - startRef.current >= DODGE_MS) {
        stop();
        setDone(true);
        return;
      }
      const list = obsRef.current;
      if (Math.random() < 0.028) {
        list.push({ id: nextId.current++, lane: Math.floor(Math.random() * DODGE_LANES), y: -0.1 });
      }
      const playerY = 0.86;
      const L = laneRef.current;
      let addHit = 0;
      obsRef.current = list
        .map((o) => ({ ...o, y: o.y + 0.01 }))
        .filter((o) => {
          if (o.y > 1.08) return false;
          if (o.y > playerY - 0.05 && o.y < playerY + 0.07 && o.lane === L) {
            addHit += 1;
            return false;
          }
          return true;
        });
      if (addHit) setHits((h) => h + addHit);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => stop();
  }, [stop]);

  const scoredRef = useRef(false);
  useEffect(() => {
    if (!done || scoredRef.current) return;
    scoredRef.current = true;
    const clean = hits <= hitForgiveness;
    onDone(clean ? 30 : Math.max(12, 22 - Math.max(0, hits - hitForgiveness) * 3));
  }, [done, hits, hitForgiveness, onDone]);

  const move = useCallback((d: -1 | 1) => setLane((l) => Math.max(0, Math.min(DODGE_LANES - 1, l + d))), []);

  return (
    <div className="cq-training-game-panel rounded-2xl border border-violet-500/35 bg-black/40 p-4 space-y-3">
      <div className="flex justify-between">
        <p className="text-sm font-bold text-white">Focus Sanctum</p>
        <button type="button" onClick={onCancel} className="text-xs text-white/50 hover:text-white">
          Retreat
        </button>
      </div>
      <p className="text-xs text-white/55">Dodge for {(DODGE_MS / 1000).toFixed(0)}s · Hits {hits} · Forgiveness {hitForgiveness}</p>
      <div className="relative mx-auto w-full max-w-[240px] aspect-[3/4] rounded-xl bg-gradient-to-b from-violet-950/50 to-black/60 border border-white/15 overflow-hidden">
        {obsRef.current.map((o) => (
          <div
            key={o.id}
            className="absolute w-[28%] h-[7%] rounded-md bg-red-500/75 border border-red-300/40"
            style={{
              left: `${(o.lane * 100) / DODGE_LANES + 100 / (2 * DODGE_LANES)}%`,
              top: `${o.y * 100}%`,
              transform: "translate(-50%, 0)",
            }}
          />
        ))}
        <div
          className="absolute w-[28%] h-[9%] rounded-lg bg-violet-400/85 border border-violet-200/60"
          style={{
            left: `${(lane * 100) / DODGE_LANES + 100 / (2 * DODGE_LANES)}%`,
            bottom: "6%",
            transform: "translateX(-50%)",
          }}
        />
      </div>
      <div className="flex gap-2 justify-center">
        <button type="button" onClick={() => move(-1)} className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold border border-white/20">◀</button>
        <button type="button" onClick={() => move(1)} className="px-6 py-3 rounded-xl bg-white/10 text-white font-bold border border-white/20">▶</button>
      </div>
    </div>
  );
}

export function TrainingGamePanel({
  stat,
  modifiers,
  onDone,
  onCancel,
}: {
  stat: StatKey;
  modifiers: TrainingGameModifiers;
  onDone: (xp: number) => void;
  onCancel: () => void;
}) {
  switch (stat) {
    case "strength":
      return <RepTimingPanel onDone={onDone} onCancel={onCancel} greenExpand={modifiers.strengthPct} />;
    case "stamina":
      return <SprintTapPanel onDone={onDone} onCancel={onCancel} bonusMs={Math.round(modifiers.staminaPct * 12)} />;
    case "knowledge":
      return <KnowledgeQuizPanel onDone={onDone} onCancel={onCancel} correctBonusPct={modifiers.knowledgePct} />;
    case "social":
      return <SocialMatchPanel onDone={onDone} onCancel={onCancel} socialBonusPct={modifiers.socialPct} />;
    case "focus":
      return (
        <FocusDodgePanel
          onDone={onDone}
          onCancel={onCancel}
          hitForgiveness={Math.max(1, 1 + Math.floor(modifiers.focusPct / 4))}
        />
      );
    default:
      return null;
  }
}
