"use client";

import { Clock, QrCode } from "lucide-react";
import type { UserQuestBoardItem } from "@/lib/adminQuestTypes";
import { DIFFICULTY_CSS } from "@/lib/questBoardStyles";
import type { QuestDifficulty } from "@/lib/questBoardCatalog";

function questStatusLabel(status: UserQuestBoardItem["status"]): string | null {
  if (status === "available") return "Available";
  if (status === "active" || status === "ready") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "pending") return "Pending approval";
  return null;
}

export function QuestCard({
  item,
  onClaim,
  claiming,
  compact = false,
}: {
  item: UserQuestBoardItem;
  onClaim: (item: UserQuestBoardItem) => void;
  claiming: boolean;
  compact?: boolean;
}) {
  const style = DIFFICULTY_CSS[item.difficulty as QuestDifficulty] ?? DIFFICULTY_CSS.easy;
  const statusLabel = questStatusLabel(item.status);
  const legendary = item.difficulty === "legendary";
  const showProgress = item.source === "daily" || item.progress.max > 1 || item.progress.current > 0;

  return (
    <article
      className={`cq-quest-card group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b transition-all duration-300 ${
        legendary
          ? "cq-quest-card-legendary border-amber-400/40 from-amber-500/15 via-cq-card to-fuchsia-500/10 ring-1 ring-amber-400/35"
          : `border-cq-border bg-cq-card shadow-sm ${item.status === "completed" ? "opacity-75" : "hover:-translate-y-0.5"}`
      }`}
    >
      <div className={`relative flex flex-1 flex-col ${compact ? "p-3" : "p-4"}`}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-cq-subtle">
            {item.source === "daily" ? "📋 Daily" : item.questType.replace("_", " ")}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>{item.difficulty}</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl border border-cq-border bg-cq-elevated text-3xl">
            {item.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold leading-tight text-cq-foreground">{item.name}</h3>
            {!compact ? (
              <p className="mt-1 text-[12px] leading-snug text-cq-muted">{item.description}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-uri-gold/35 bg-uri-gold/10 px-2 py-1 text-[11px] font-bold text-uri-gold">
            +{item.xpReward} XP
          </span>
          {item.locationName && !compact ? (
            <span className="rounded-lg border border-cq-border bg-cq-elevated px-2 py-1 text-[10px] text-cq-muted">
              📍 {item.locationName}
            </span>
          ) : null}
          {item.requiresQr ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-cq-border bg-cq-elevated px-2 py-1 text-[10px] text-cq-muted">
              <QrCode className="h-3 w-3" aria-hidden />
              QR required
            </span>
          ) : null}
          {item.endsAt ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-cq-muted">
              <Clock className="h-3 w-3" aria-hidden />
              {formatTimeRemaining(item.endsAt)}
            </span>
          ) : null}
        </div>
        {showProgress ? (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] tabular-nums text-cq-muted">
              <span>
                {item.progress.current} / {item.progress.max}
              </span>
              <span>{item.progress.percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-cq-elevated">
              <div
                className="cq-quest-progress h-full rounded-full bg-gradient-to-r from-uri-keaney to-uri-gold transition-all duration-700"
                style={{ width: `${item.progress.percent}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {statusLabel ? (
            <p
              className={`text-center text-[11px] font-semibold ${
                item.status === "completed"
                  ? "text-emerald-300/90"
                  : item.status === "pending"
                    ? "text-amber-300/90"
                    : "text-uri-keaney/90"
              }`}
            >
              {statusLabel}
            </p>
          ) : null}
          {item.canClaim && item.source === "admin" ? (
            <button
              type="button"
              disabled={claiming}
              onClick={() => onClaim(item)}
              className="cq-quest-claim w-full rounded-xl bg-gradient-to-b from-uri-gold to-amber-600 py-2.5 text-sm font-bold text-uri-navy shadow-lg transition hover:brightness-110 disabled:opacity-50"
            >
              {claiming
                ? "Submitting…"
                : item.completionMethod === "admin_approval"
                  ? "Submit for approval"
                  : "Complete quest"}
            </button>
          ) : null}
          {item.requiresQr && item.status !== "completed" ? (
            <p className="text-center text-[11px] text-cq-subtle">Scan the quest QR code to complete</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function formatTimeRemaining(endsAt: string): string {
  const ms = Date.parse(endsAt) - Date.now();
  if (ms <= 0) return "Ended";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `Ends ${new Date(endsAt).toLocaleDateString()}`;
  if (hours >= 1) return `${hours}h left`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `${mins}m left`;
}
