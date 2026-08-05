"use client";

import type { ReactNode } from "react";
import type { CaptionMentionDraft } from "@/lib/postTags";

/**
 * Renders caption text with tappable mention spans from stored metadata.
 * Falls back to plain text when mentions are empty or invalid.
 */
export function CaptionWithMentions({
  body,
  mentions,
  onOpenEntity,
}: {
  body: string;
  mentions?: CaptionMentionDraft[] | null;
  onOpenEntity?: (mention: CaptionMentionDraft) => void;
}) {
  const sorted = [...(mentions ?? [])].sort((a, b) => a.startIndex - b.startIndex);
  if (!sorted.length) {
    return <>{body}</>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((m, i) => {
    const start = Math.max(cursor, Math.min(body.length, m.startIndex));
    const end = Math.max(start, Math.min(body.length, m.endIndex));
    if (start > cursor) {
      nodes.push(<span key={`t-${i}-${cursor}`}>{body.slice(cursor, start)}</span>);
    }
    const label = body.slice(start, end) || m.displayText;
    nodes.push(
      <button
        key={`m-${i}-${start}`}
        type="button"
        className="font-semibold text-uri-keaney hover:underline"
        onClick={() => onOpenEntity?.(m)}
      >
        {label}
      </button>,
    );
    cursor = end;
  });
  if (cursor < body.length) {
    nodes.push(<span key="tail">{body.slice(cursor)}</span>);
  }
  return <>{nodes}</>;
}
