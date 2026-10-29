import sharp from "sharp";
import { anonymousStoragePath, storagePathRevealsAccount } from "@/lib/anonymousPost";
import { ApiError } from "@/lib/server/http";
import { createAdminClient } from "@/lib/server/supabase";

const BUCKET = "quad-post-images";

function extensionOf(path: string): string {
  const clean = path.split("?")[0] ?? path;
  const part = clean.split(".").pop() ?? "bin";
  return part.slice(0, 8);
}

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0] ?? "");
}

async function copyWithoutIdentity(args: {
  fromPath: string;
  userId: string;
  mime: string | null;
}): Promise<string> {
  if (!storagePathRevealsAccount(args.fromPath, args.userId) && args.fromPath.startsWith("anon/")) {
    return args.fromPath;
  }
  const admin = createAdminClient();
  const downloaded = await admin.storage.from(BUCKET).download(args.fromPath);
  if (downloaded.error || !downloaded.data) {
    throw new ApiError(400, "Could not move anonymous media.", "ANONYMOUS_MEDIA_MOVE_FAILED");
  }
  const source = Buffer.from(await downloaded.data.arrayBuffer());
  const image = (args.mime ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(args.fromPath);
  const body = image
    ? await sharp(source, { animated: args.fromPath.endsWith(".gif") }).rotate().toBuffer()
    : source;
  const nextPath = anonymousStoragePath(extensionOf(args.fromPath));
  const uploaded = await admin.storage.from(BUCKET).upload(nextPath, body, {
    contentType: args.mime ?? undefined,
    upsert: false,
  });
  if (uploaded.error) {
    throw new ApiError(400, "Could not store anonymous media.", "ANONYMOUS_MEDIA_STORE_FAILED");
  }
  await admin.storage.from(BUCKET).remove([args.fromPath]);
  return nextPath;
}

function publicUrl(path: string): string {
  const { data } = createAdminClient().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Move post media out of the account folder and drop identifying upload metadata. */
export async function relocateAnonymousPostMedia(args: { postId: string; userId: string }): Promise<void> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("quad_post_media")
    .select("id, storage_path, playback_path, thumbnail_path, mime_type")
    .eq("post_id", args.postId)
    .is("deleted_at", null);
  if (error) throw new ApiError(400, error.message, "ANONYMOUS_MEDIA_LOOKUP_FAILED");

  const { data: postMeta } = await admin
    .from("quad_posts")
    .select("cover_media_id")
    .eq("id", args.postId)
    .maybeSingle();
  const coverMediaId = (postMeta?.cover_media_id as string | null) ?? null;
  let coverPlayback: string | null = null;
  let coverThumb: string | null = null;
  for (const row of rows ?? []) {
    const storagePath = String(row.storage_path ?? "");
    const playbackPath = String(row.playback_path ?? storagePath);
    const thumbPath = row.thumbnail_path ? String(row.thumbnail_path) : null;
    const mime = (row.mime_type as string | null) ?? null;
    const nextStorage = storagePath
      ? await copyWithoutIdentity({ fromPath: storagePath, userId: args.userId, mime })
      : storagePath;
    const nextPlayback =
      playbackPath && playbackPath !== storagePath
        ? await copyWithoutIdentity({ fromPath: playbackPath, userId: args.userId, mime })
        : nextStorage;
    const nextThumb =
      thumbPath && thumbPath !== storagePath && thumbPath !== playbackPath
        ? await copyWithoutIdentity({ fromPath: thumbPath, userId: args.userId, mime: "image/jpeg" })
        : nextPlayback;
    await admin
      .from("quad_post_media")
      .update({
        storage_path: nextStorage,
        playback_path: nextPlayback,
        thumbnail_path: nextThumb,
        uploader_id: null,
      })
      .eq("id", row.id);
    const isCover = coverMediaId ? row.id === coverMediaId : !coverPlayback;
    if (isCover) {
      coverPlayback = nextPlayback || coverPlayback;
      coverThumb = nextThumb || coverThumb;
    }
  }

  if (coverPlayback) {
    await admin
      .from("quad_posts")
      .update({
        proof_url: publicUrl(coverPlayback),
        poster_url: coverThumb ? publicUrl(coverThumb) : null,
        media_storage_path: coverPlayback,
      })
      .eq("id", args.postId);
    return;
  }

  const { data: post } = await admin
    .from("quad_posts")
    .select("proof_url, media_storage_path, media_mime_type")
    .eq("id", args.postId)
    .maybeSingle();
  const proofPath = pathFromPublicUrl(post?.proof_url as string | null) ?? (post?.media_storage_path as string | null);
  if (!proofPath || !storagePathRevealsAccount(proofPath, args.userId)) return;
  const nextProof = await copyWithoutIdentity({
    fromPath: proofPath,
    userId: args.userId,
    mime: (post?.media_mime_type as string | null) ?? null,
  });
  await admin
    .from("quad_posts")
    .update({
      proof_url: publicUrl(nextProof),
      media_storage_path: nextProof,
    })
    .eq("id", args.postId);
}
