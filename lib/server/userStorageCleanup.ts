import { createAdminClient } from "@/lib/server/supabase";
import { parseDmStorageRef } from "@/lib/server/dmRichMessages";

type AdminClient = ReturnType<typeof createAdminClient>;

export type StorageObjectRef = {
  bucket: string;
  path: string;
};

const QUAD_BUCKET = "quad-post-images";
const DM_IMAGE_BUCKET = "dm-images";
const DM_AUDIO_BUCKET = "dm-audio";

export function isUserOwnedStoragePath(userId: string, path: string): boolean {
  const normalized = path.replace(/^\/+/, "");
  if (normalized.startsWith(`${userId}/`)) return true;
  const parts = normalized.split("/");
  return parts.length >= 3 && parts[1] === userId;
}

export function storageRefFromPublicUrl(raw: string | null | undefined): StorageObjectRef | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  const dm = parseDmStorageRef(value);
  if (dm) return { bucket: dm.bucket, path: dm.path };
  try {
    const url = new URL(value);
    const marker = "/storage/v1/object/public/";
    const idx = url.pathname.indexOf(marker);
    if (idx < 0) return null;
    const rest = decodeURIComponent(url.pathname.slice(idx + marker.length));
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
  } catch {
    const slash = value.indexOf("/");
    if (slash <= 0) return null;
    return { bucket: value.slice(0, slash), path: value.slice(slash + 1) };
  }
}

function addRef(into: Map<string, StorageObjectRef>, ref: StorageObjectRef | null, userId: string) {
  if (!ref?.bucket || !ref.path) return;
  if (!isUserOwnedStoragePath(userId, ref.path)) return;
  into.set(`${ref.bucket}:${ref.path}`, ref);
}

async function listPrefix(admin: AdminClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  const queue = [prefix.replace(/\/+$/, "")];
  let safety = 0;
  while (queue.length > 0 && safety < 200) {
    safety += 1;
    const folder = queue.shift() ?? "";
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
    if (error || !data) continue;
    for (const item of data) {
      const next = folder ? `${folder}/${item.name}` : item.name;
      const isFile = Boolean(item.id) || Boolean(item.metadata);
      if (isFile) paths.push(next);
      else queue.push(next);
    }
  }
  return paths;
}

export async function collectUserStorageObjects(
  admin: AdminClient,
  userId: string,
): Promise<StorageObjectRef[]> {
  const refs = new Map<string, StorageObjectRef>();

  const { data: mediaRows } = await admin
    .from("quad_post_media")
    .select("storage_path, playback_path, thumbnail_path")
    .eq("uploader_id", userId);
  for (const row of mediaRows ?? []) {
    for (const path of [row.storage_path, row.playback_path, row.thumbnail_path]) {
      if (typeof path === "string" && path.trim()) {
        addRef(refs, { bucket: QUAD_BUCKET, path: path.trim() }, userId);
      }
    }
  }

  const { data: memories } = await admin.from("campus_memories").select("media_url").eq("user_id", userId);
  for (const row of memories ?? []) {
    addRef(refs, storageRefFromPublicUrl(row.media_url as string | null), userId);
  }

  const { data: profile } = await admin.from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
  addRef(refs, storageRefFromPublicUrl(profile?.avatar_url as string | null), userId);

  const { data: messages } = await admin
    .from("direct_messages")
    .select("image_url")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
  for (const row of messages ?? []) {
    addRef(refs, storageRefFromPublicUrl(row.image_url as string | null), userId);
  }

  const { data: proofs } = await admin.from("proof_submissions").select("storage_path").eq("user_id", userId);
  for (const row of proofs ?? []) {
    if (typeof row.storage_path === "string" && row.storage_path.trim()) {
      addRef(refs, { bucket: QUAD_BUCKET, path: row.storage_path.trim() }, userId);
    }
  }

  const { data: participants } = await admin
    .from("direct_conversation_participants")
    .select("conversation_id")
    .eq("user_id", userId);
  for (const row of participants ?? []) {
    const conversationId = String(row.conversation_id ?? "");
    if (!conversationId) continue;
    const prefix = `${conversationId}/${userId}`;
    for (const bucket of [DM_IMAGE_BUCKET, DM_AUDIO_BUCKET]) {
      const listed = await listPrefix(admin, bucket, prefix);
      for (const path of listed) addRef(refs, { bucket, path }, userId);
    }
  }

  for (const prefix of [userId, `${userId}/quad-posts`, `${userId}/campus-memories`, `${userId}/marketplace`, `${userId}/posts`]) {
    const listed = await listPrefix(admin, QUAD_BUCKET, prefix);
    for (const path of listed) addRef(refs, { bucket: QUAD_BUCKET, path }, userId);
  }

  return Array.from(refs.values());
}

export async function removeUserStorageObjects(
  admin: AdminClient,
  refs: StorageObjectRef[],
): Promise<{ removed: number; failed: number }> {
  const byBucket = new Map<string, string[]>();
  for (const ref of refs) {
    const paths = byBucket.get(ref.bucket) ?? [];
    paths.push(ref.path);
    byBucket.set(ref.bucket, paths);
  }

  let removed = 0;
  let failed = 0;
  for (const [bucket, paths] of Array.from(byBucket.entries())) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) {
        failed += chunk.length;
        console.error("[cq:account-delete] storage remove failed", {
          bucket,
          count: chunk.length,
          message: error.message,
        });
      } else {
        removed += chunk.length;
      }
    }
  }
  return { removed, failed };
}
