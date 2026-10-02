/**
 * One-off end-to-end check of the direct-to-Storage media flow against the configured Supabase
 * project, as the QA account. Uploads a synthetic MOV, registers it, then discards it.
 * Run: npx tsx --env-file=.env.local scripts/verify-direct-upload.ts [sizeMB] [accountEmail]
 * The account must have a profiles row (quad_post_media.uploader_id references profiles).
 */
import { createClient } from "@supabase/supabase-js";
import {
  completeDirectUpload,
  discardDirectUpload,
  initDirectUpload,
  parseDirectUploadInit,
} from "@/lib/server/quadDirectUpload";

async function main() {
  const sizeMb = Number(process.argv[2] ?? 35);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const email = (process.argv[3] ?? process.env.QA_TEST_ACCOUNT_EMAIL!).toLowerCase();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const qa = users.users.find((u) => u.email?.toLowerCase() === email);
  if (!qa) throw new Error("QA account not found");

  const size = sizeMb * 1024 * 1024;
  const bytes = Buffer.alloc(size);
  Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  ")]).copy(bytes, 0);

  const input = parseDirectUploadInit({
    kind: "video",
    mimeType: "video/quicktime",
    fileSizeBytes: size,
    idempotencyKey: `cq-verify-${Date.now()}`,
    durationSeconds: 30.2,
    width: 1080,
    height: 1920,
    hasAudio: true,
  });
  const init = await initDirectUpload({ userId: qa.id, input });
  if (init.status !== "upload") throw new Error("unexpected ready");
  console.log("init ok", { pathOwnedByUser: init.path.startsWith(`${qa.id}/posts/`), upsert: init.upsert });

  // Same request the browser XHR sends (uploadFileToSignedUrl).
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", new Blob([bytes], { type: init.contentType }));
  const started = Date.now();
  const put = await fetch(init.signedUrl, {
    method: "PUT",
    headers: { "x-upsert": "false", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    body,
  });
  console.log("storage PUT", { status: put.status, sizeMb, ms: Date.now() - started, body: (await put.text()).slice(0, 160).replace(init.path, "<path>") });

  if (put.ok) {
    const media = await completeDirectUpload({ userId: qa.id, mediaId: init.mediaId });
    console.log("complete ok", {
      processingStatus: media.processingStatus,
      fileSizeBytes: media.fileSizeBytes,
      durationSeconds: media.durationSeconds,
      mimeType: media.mimeType,
    });
  }
  const discarded = await discardDirectUpload({ userId: qa.id, mediaId: init.mediaId });
  const { data: left } = await admin.storage.from("quad-post-images").info(init.path);
  console.log("discard", { ...discarded, objectStillExists: Boolean(left) });
}

main().catch((error) => {
  console.error("verify failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
