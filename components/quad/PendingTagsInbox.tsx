"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAuthed, patchAuthed } from "@/lib/client/dashboardApi";
import { AvatarDisplay } from "@/components/AvatarDisplay";
import { emitSocialSync, subscribeSocialSync } from "@/lib/client/socialSync";

type PendingTagItem = {
  tagId: string;
  postId: string;
  createdAt: string;
  tagSource: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  postPreview: {
    body: string;
    proofUrl: string | null;
    createdAt: string;
  };
};

export function PendingTagsInbox({
  embedded = false,
  onOpenPost,
}: {
  embedded?: boolean;
  onOpenPost?: (postId: string) => void;
}) {
  const [tags, setTags] = useState<PendingTagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchAuthed<{ tags: PendingTagItem[] }>("/api/me/pending-tags");
      setTags(data.tags ?? []);
      setError(null);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Could not load tag reviews.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsub = subscribeSocialSync(() => void load(true));
    return unsub;
  }, [load]);

  async function decide(tagId: string, action: "approve" | "reject") {
    setBusyId(tagId);
    try {
      await patchAuthed(`/api/me/pending-tags/${tagId}`, { action });
      setTags((prev) => prev.filter((t) => t.tagId !== tagId));
      emitSocialSync({ source: "inbox" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update tag.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && tags.length === 0) return null;
  if (!loading && tags.length === 0 && !error) return null;

  return (
    <section
      className={`${embedded ? "mx-4 mt-3" : ""} rounded-2xl border border-uri-keaney/30 bg-uri-keaney/10 p-3`}
      aria-label="Tags to review"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Tags to review</h3>
        <span className="rounded-full bg-uri-keaney/25 px-2 py-0.5 text-[11px] font-semibold text-uri-keaney">
          {tags.length}
        </span>
      </div>
      {error ? (
        <p className="mb-2 text-xs text-amber-300" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {tags.map((tag) => (
          <li
            key={tag.tagId}
            className="rounded-xl border border-white/10 bg-black/25 p-3"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/10">
                {tag.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tag.author.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <AvatarDisplay avatar="🎓" fitParent size={40} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">
                  <span className="font-semibold">@{tag.author.username}</span>
                  {" tagged you in a post."}
                </p>
                {tag.postPreview.body.trim() ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-white/55">{tag.postPreview.body}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === tag.tagId}
                    onClick={() => void decide(tag.tagId, "approve")}
                    className="min-h-[40px] rounded-lg bg-uri-keaney px-3 text-xs font-semibold text-uri-navy disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === tag.tagId}
                    onClick={() => void decide(tag.tagId, "reject")}
                    className="min-h-[40px] rounded-lg bg-white/10 px-3 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Reject
                  </button>
                  {onOpenPost ? (
                    <button
                      type="button"
                      className="min-h-[40px] rounded-lg px-3 text-xs font-semibold text-[#0095f6]"
                      onClick={() => onOpenPost(tag.postId)}
                    >
                      View post
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
