"use client";

import { useEffect, useState } from "react";
import { fetchAuthed } from "@/lib/client/dashboardApi";
import { hasTorchBearerBadge } from "@/lib/torchBearerBadge";
import type { Character } from "@/lib/types";

type FounderRow = {
  user_id: string;
  founder_number: number;
  awarded_at: string;
  username?: string | null;
  display_name?: string | null;
};

type FounderPayload = {
  visible: boolean;
  mine?: { founder_number: number } | null;
  founders?: FounderRow[];
  fullyClaimed?: boolean;
};

export function TorchBearerFounderRank({ character }: { character: Character }) {
  const [data, setData] = useState<FounderPayload | null>(null);

  useEffect(() => {
    if (!hasTorchBearerBadge(character)) return;
    let cancelled = false;
    void fetchAuthed<FounderPayload>("/api/beta-founders")
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [character.id, character.torchBearerFounderNumber]);

  if (!hasTorchBearerBadge(character) || !data?.visible || !data.founders?.length) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-fuchsia-400/25 bg-fuchsia-500/5 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-fuchsia-200/90">Founder Rank</h3>
      <p className="mt-1 text-[11px] text-white/50">
        {data.fullyClaimed ? "Founder badges are fully claimed." : "Original CampusQuest torch bearers."}
      </p>
      <ol className="mt-3 max-h-48 space-y-1 overflow-y-auto">
        {data.founders.map((row) => {
          const isMe = row.user_id === character.id;
          return (
            <li
              key={row.user_id}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                isMe ? "bg-fuchsia-500/15 border border-fuchsia-400/30" : "bg-white/[0.03]"
              }`}
            >
              <span className={isMe ? "font-semibold text-white" : "text-white/80"}>
                #{row.founder_number} Torch Bearer
                {isMe ? <span className="ml-1.5 text-[10px] text-fuchsia-200">(you)</span> : null}
              </span>
              <span className="text-xs text-white/45 truncate max-w-[40%]">
                {row.display_name ?? row.username ?? ""}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
