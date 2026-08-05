"use client";

import { useCallback, useEffect, useState } from "react";
import type { FieldNote } from "@/lib/types";
import { fetchTaggedPosts } from "@/lib/client/quadPostsClient";
import { ProfilePostsGrid } from "@/components/profile/ProfilePostsGrid";
import type { TagEntityType } from "@/lib/postTags";

export function TaggedEntityPostsSection({
  entityType,
  entityId,
  viewerId = "",
  title = "Community posts",
}: {
  entityType: TagEntityType;
  entityId: string;
  viewerId?: string;
  title?: string;
}) {
  const [posts, setPosts] = useState<FieldNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchTaggedPosts(entityType, entityId, viewerId, 30);
      setPosts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tagged posts.");
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, viewerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{title}</p>
      <ProfilePostsGrid
        posts={posts}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        onSelectPost={() => {
          /* detail navigation handled by parent feeds; tiles still open via grid callback */
        }}
      />
      {!loading && !error && posts.length === 0 ? (
        <p className="text-xs text-white/50">No tagged posts yet.</p>
      ) : null}
    </div>
  );
}
