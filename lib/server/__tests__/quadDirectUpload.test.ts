import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory stand-in for the service-role client: quad_post_media rows + Storage objects. */
type Row = Record<string, unknown>;
type StoredObject = { size: number; contentType: string; head: Buffer };

const db = {
  rows: [] as Row[],
  objects: new Map<string, StoredObject>(),
  removed: [] as string[],
  signed: [] as Array<{ path: string; upsert: boolean }>,
  failReadyUpdate: false,
};

class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row = {};
  private head = false;
  private returning = false;
  private single = false;
  private max = Infinity;

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.head = Boolean(opts?.head);
    else this.returning = true;
    return this;
  }
  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  is(col: string, value: null) {
    this.filters.push((r) => (r[col] ?? null) === value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  gte(col: string, value: string) {
    this.filters.push((r) => String(r[col]) >= value);
    return this;
  }
  lt(col: string, value: string) {
    this.filters.push((r) => String(r[col]) < value);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then<T>(resolve: (value: unknown) => T, reject?: (e: unknown) => T) {
    return Promise.resolve(this.exec()).then(resolve, reject);
  }
  private matched() {
    return db.rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max);
  }
  private exec() {
    if (this.op === "insert") {
      const dup = db.rows.some(
        (r) =>
          r.deleted_at == null &&
          r.uploader_id === this.payload.uploader_id &&
          r.idempotency_key === this.payload.idempotency_key,
      );
      if (dup) return { error: { code: "23505", message: "duplicate" } };
      db.rows.push({ created_at: new Date().toISOString(), deleted_at: null, ...this.payload });
      return { error: null };
    }
    if (this.op === "update") {
      if (db.failReadyUpdate && this.payload.processing_status === "ready") {
        return { data: null, error: { message: "db unavailable" } };
      }
      const hits = this.matched();
      for (const r of hits) Object.assign(r, this.payload);
      return { data: this.returning ? hits.map((r) => ({ ...r })) : null, error: null };
    }
    const hits = this.matched();
    if (this.head) return { count: hits.length, data: null, error: null };
    if (this.single) return { data: hits[0] ? { ...hits[0] } : null, error: null };
    return { data: hits.map((r) => ({ ...r })), error: null };
  }
}

const SUPABASE = "https://proj.supabase.co/storage/v1";
const storageBucket = {
  getPublicUrl: (path: string) => ({ data: { publicUrl: `${SUPABASE}/object/public/quad-post-images/${path}` } }),
  createSignedUploadUrl: async (path: string, opts?: { upsert?: boolean }) => {
    db.signed.push({ path, upsert: opts?.upsert === true });
    return {
      data: { signedUrl: `${SUPABASE}/object/upload/sign/quad-post-images/${path}?token=tok`, token: "tok", path },
      error: null,
    };
  },
  info: async (path: string) => {
    const obj = db.objects.get(path);
    return obj
      ? { data: { size: obj.size, contentType: obj.contentType }, error: null }
      : { data: null, error: { message: "Object not found" } };
  },
  remove: async (paths: string[]) => {
    for (const p of paths) {
      db.objects.delete(p);
      db.removed.push(p);
    }
    return { data: [], error: null };
  },
  upload: async (path: string, buffer: Buffer, opts: { contentType: string }) => {
    db.objects.set(path, { size: buffer.length, contentType: opts.contentType, head: buffer.subarray(0, 16) });
    return { data: { path }, error: null };
  },
};

const requireAuthUser = vi.fn();

vi.mock("@/lib/server/supabase", () => ({
  createAdminClient: () => ({
    from: () => new Query(),
    storage: { from: () => storageBucket },
  }),
  requireAuthUser: (request: Request) => requireAuthUser(request),
}));

import { ApiError } from "@/lib/server/http";
import {
  QUAD_DIRECT_UPLOAD_MAX_PENDING,
  cleanupStaleQuadMediaUploads,
  completeDirectUpload,
  discardDirectUpload,
  initDirectUpload,
  parseDirectUploadInit,
} from "@/lib/server/quadDirectUpload";
import { attachCarouselMediaToPost } from "@/lib/server/quadPostMedia";
import { POST as initRoute } from "@/app/api/quad/posts/media/upload-init/route";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const MOV = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(8)]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

let keySeq = 0;
function key() {
  keySeq += 1;
  return `cq-test-key-${keySeq}`;
}

function imageInit(overrides: Record<string, unknown> = {}) {
  return parseDirectUploadInit({
    kind: "image",
    mimeType: "image/jpeg",
    fileSizeBytes: 2_000_000,
    idempotencyKey: key(),
    width: 1200,
    height: 900,
    ...overrides,
  });
}

function videoInit(overrides: Record<string, unknown> = {}) {
  return parseDirectUploadInit({
    kind: "video",
    mimeType: "video/quicktime",
    fileSizeBytes: 60 * 1024 * 1024,
    idempotencyKey: key(),
    durationSeconds: 42.7,
    width: 1080,
    height: 1920,
    hasAudio: true,
    ...overrides,
  });
}

/** What the browser's signed PUT does: the object lands at the server-chosen path. */
function simulateStoragePut(path: string, head: Buffer, contentType: string, size = 2_000_000) {
  db.objects.set(path, { size, contentType, head });
}

function expectApiError(promise: Promise<unknown>, status: number, code?: string) {
  return expect(promise).rejects.toSatisfy((e: unknown) => {
    return e instanceof ApiError && e.status === status && (code === undefined || e.code === code);
  });
}

beforeEach(() => {
  db.rows = [];
  db.objects.clear();
  db.removed = [];
  db.signed = [];
  db.failReadyUpdate = false;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret-do-not-leak";
  requireAuthUser.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = decodeURIComponent(String(url).split("/object/public/quad-post-images/")[1] ?? "");
      const obj = db.objects.get(path);
      if (!obj) return new Response("not found", { status: 404 });
      return new Response(new Uint8Array(obj.head), { status: 206 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("upload-init route", () => {
  function initRequest(body: unknown) {
    return new Request("http://localhost/api/quad/posts/media/upload-init", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer user-jwt" },
      body: JSON.stringify(body),
    });
  }

  it("rejects unauthenticated callers before creating anything", async () => {
    requireAuthUser.mockRejectedValue(new ApiError(401, "Invalid or expired token.", "UNAUTHORIZED"));
    const res = await initRoute(
      initRequest({ kind: "image", mimeType: "image/jpeg", fileSizeBytes: 10, idempotencyKey: key() }),
    );
    expect(res.status).toBe(401);
    expect(db.rows).toHaveLength(0);
    expect(db.signed).toHaveLength(0);
  });

  it("gives an authenticated user a signed target in their own namespace, ignoring client owner/path/bucket", async () => {
    requireAuthUser.mockResolvedValue({ user: { id: USER } });
    const res = await initRoute(
      initRequest({
        kind: "video",
        mimeType: "video/quicktime",
        fileSizeBytes: 60 * 1024 * 1024,
        idempotencyKey: key(),
        durationSeconds: 30,
        uploaderId: OTHER,
        userId: OTHER,
        path: `${OTHER}/posts/evil.mov`,
        bucket: "avatars",
      }),
    );
    const text = await res.text();
    expect(res.status).toBe(200);
    const { data } = JSON.parse(text);
    expect(data.status).toBe("upload");
    expect(data.bucket).toBe("quad-post-images");
    expect(data.path.startsWith(`${USER}/posts/`)).toBe(true);
    expect(data.signedUrl).toContain(`/object/upload/sign/quad-post-images/${USER}/posts/`);
    expect(data.contentType).toBe("video/quicktime");
    expect(text).not.toContain("service-role-secret-do-not-leak");
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ uploader_id: USER, processing_status: "uploading", post_id: null });
  });
});

describe("init validation", () => {
  it.each([
    ["image", "image/svg+xml"],
    ["image", "text/html"],
    ["image", "image/heic"],
    ["video", "video/x-msvideo"],
    ["video", "application/octet-stream"],
  ])("rejects %s with MIME %s", (kind, mimeType) => {
    expect(() =>
      parseDirectUploadInit({ kind, mimeType, fileSizeBytes: 1000, idempotencyKey: key(), durationSeconds: 5 }),
    ).toThrow(ApiError);
  });

  it("rejects oversize images and videos", () => {
    expect(() => imageInit({ fileSizeBytes: 26 * 1024 * 1024 })).toThrow(/too large/i);
    // A ~2:50 1080p phone video fits; anything over the 250 MB cap is refused before upload.
    expect(() => videoInit({ fileSizeBytes: 190 * 1024 * 1024, durationSeconds: 170 })).not.toThrow();
    expect(() => videoInit({ fileSizeBytes: 251 * 1024 * 1024 })).toThrow();
    try {
      videoInit({ fileSizeBytes: 251 * 1024 * 1024 });
    } catch (e) {
      expect((e as ApiError).status).toBe(413);
      expect((e as ApiError).message).toBe("This video file is too large to upload.");
    }
  });

  it("rejects videos over 3 minutes, empty files, and bad upload ids", () => {
    expect(() => videoInit({ durationSeconds: 181 })).toThrow();
    expect(() => imageInit({ fileSizeBytes: 0 })).toThrow();
    expect(() => imageInit({ idempotencyKey: "../../x" })).toThrow();
  });

  it("caps pending uploads per user at one carousel", async () => {
    for (let i = 0; i < QUAD_DIRECT_UPLOAD_MAX_PENDING; i += 1) {
      await initDirectUpload({ userId: USER, input: imageInit() });
    }
    await expectApiError(initDirectUpload({ userId: USER, input: imageInit() }), 429, "MEDIA_UPLOAD_PENDING_LIMIT");
  });
});

describe("init → Storage → complete", () => {
  it("registers a photo only after verifying the stored object", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    expect(db.rows[0]!.processing_status).toBe("uploading");

    simulateStoragePut(init.path, JPEG, "image/jpeg", 1_900_000);
    const media = await completeDirectUpload({ userId: USER, mediaId: init.mediaId });

    expect(media).toMatchObject({ mediaId: init.mediaId, mediaType: "image", processingStatus: "ready", fileSizeBytes: 1_900_000 });
    expect(media.playbackUrl).toContain(init.path);
    expect(db.rows[0]).toMatchObject({ processing_status: "ready", file_size_bytes: 1_900_000 });
  });

  it("registers an iPhone MOV (original bytes) with duration/dimensions and the optional poster", async () => {
    const init = await initDirectUpload({ userId: USER, input: videoInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    expect(init.path.endsWith(".mov")).toBe(true);
    simulateStoragePut(init.path, MOV, "video/quicktime", 60 * 1024 * 1024);

    const media = await completeDirectUpload({
      userId: USER,
      mediaId: init.mediaId,
      poster: { buffer: JPEG, mime: "image/jpeg" },
    });
    expect(media).toMatchObject({
      mediaType: "video",
      durationSeconds: 42.7,
      width: 1080,
      height: 1920,
      hasAudio: true,
      mimeType: "video/quicktime",
    });
    expect(media.posterUrl).toContain(`${USER}/quad-media/${init.mediaId}/poster.jpg`);
  });

  it("still registers the video when the cover frame is unusable", async () => {
    const init = await initDirectUpload({ userId: USER, input: videoInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, MOV, "video/quicktime");
    const media = await completeDirectUpload({
      userId: USER,
      mediaId: init.mediaId,
      poster: { buffer: Buffer.from("x"), mime: "application/pdf" },
    });
    expect(media.processingStatus).toBe("ready");
    expect(media.posterUrl).toBeNull();
  });

  it("rejects and deletes an object larger than allowed, whatever the client declared", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit({ fileSizeBytes: 1000 }) });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, JPEG, "image/jpeg", 40 * 1024 * 1024);

    await expectApiError(completeDirectUpload({ userId: USER, mediaId: init.mediaId }), 413, "IMAGE_TOO_LARGE");
    expect(db.objects.has(init.path)).toBe(false);
    expect(db.rows[0]!.processing_status).toBe("failed");
  });

  it("rejects a stored content type that differs from the approved MIME (no text/html in the public bucket)", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, HTML, "text/html");

    await expectApiError(completeDirectUpload({ userId: USER, mediaId: init.mediaId }), 400, "MEDIA_CONTENT_TYPE_MISMATCH");
    expect(db.objects.has(init.path)).toBe(false);
  });

  it("rejects bytes that are not really the declared media type", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, HTML, "image/jpeg");

    await expectApiError(completeDirectUpload({ userId: USER, mediaId: init.mediaId }), 400, "IMAGE_FORMAT_UNSUPPORTED");
    expect(db.objects.has(init.path)).toBe(false);
    expect(db.rows[0]!.processing_status).toBe("failed");
  });

  it("keeps tracking the object when Storage succeeded but registration failed, then completes on retry", async () => {
    const input = imageInit();
    const init = await initDirectUpload({ userId: USER, input });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, JPEG, "image/jpeg");

    db.failReadyUpdate = true;
    await expectApiError(completeDirectUpload({ userId: USER, mediaId: init.mediaId }), 500, "MEDIA_READY_FAILED");
    // Not silently lost: row still points at the object and the bytes are kept.
    expect(db.rows[0]).toMatchObject({ processing_status: "uploading", storage_path: init.path });
    expect(db.objects.has(init.path)).toBe(true);

    db.failReadyUpdate = false;
    const retryInit = await initDirectUpload({ userId: USER, input });
    if (retryInit.status !== "upload") throw new Error("expected upload");
    expect(retryInit.mediaId).toBe(init.mediaId);
    expect(retryInit.path).toBe(init.path);
    expect(retryInit.upsert).toBe(true);

    const media = await completeDirectUpload({ userId: USER, mediaId: init.mediaId });
    expect(media.processingStatus).toBe("ready");
    expect(db.rows).toHaveLength(1);
  });

  it("returns the finished media for a repeated init/complete with the same key (no duplicate rows)", async () => {
    const input = imageInit();
    const init = await initDirectUpload({ userId: USER, input });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, JPEG, "image/jpeg");
    await completeDirectUpload({ userId: USER, mediaId: init.mediaId });

    const again = await initDirectUpload({ userId: USER, input });
    expect(again).toMatchObject({ status: "ready", media: { mediaId: init.mediaId } });
    await expect(completeDirectUpload({ userId: USER, mediaId: init.mediaId })).resolves.toMatchObject({
      mediaId: init.mediaId,
    });
    expect(db.rows).toHaveLength(1);
  });

  it("refuses to complete before the bytes exist", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    await expectApiError(completeDirectUpload({ userId: USER, mediaId: init.mediaId }), 409, "MEDIA_UPLOAD_MISSING");
    expect(db.rows[0]!.processing_status).toBe("uploading");
  });

  it("never lets another user complete or discard someone else's upload", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, JPEG, "image/jpeg");
    await expectApiError(completeDirectUpload({ userId: OTHER, mediaId: init.mediaId }), 403, "MEDIA_FORBIDDEN");
    await expectApiError(discardDirectUpload({ userId: OTHER, mediaId: init.mediaId }), 403, "MEDIA_FORBIDDEN");
    expect(db.objects.has(init.path)).toBe(true);
  });
});

describe("discard + cleanup never touch attached media", () => {
  it("a discarded upload cannot be finalized afterwards", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, JPEG, "image/jpeg");

    await expect(discardDirectUpload({ userId: USER, mediaId: init.mediaId })).resolves.toEqual({ discarded: true });
    expect(db.objects.has(init.path)).toBe(false);
    await expectApiError(completeDirectUpload({ userId: USER, mediaId: init.mediaId }), 404, "MEDIA_NOT_FOUND");
  });

  it("refuses to discard media attached to a post", async () => {
    const init = await initDirectUpload({ userId: USER, input: imageInit() });
    if (init.status !== "upload") throw new Error("expected upload");
    simulateStoragePut(init.path, JPEG, "image/jpeg");
    await completeDirectUpload({ userId: USER, mediaId: init.mediaId });
    db.rows[0]!.post_id = "post-1";

    await expectApiError(discardDirectUpload({ userId: USER, mediaId: init.mediaId }), 409, "MEDIA_ALREADY_ATTACHED");
    expect(db.objects.has(init.path)).toBe(true);
  });

  it("sweeps stale unattached uploads only", async () => {
    const now = Date.now();
    const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
    const seed = (id: string, status: string, createdAt: string, postId: string | null) => {
      const path = `${USER}/posts/${id}.jpg`;
      db.rows.push({
        id,
        uploader_id: USER,
        post_id: postId,
        processing_status: status,
        storage_path: path,
        thumbnail_path: path,
        created_at: createdAt,
        deleted_at: null,
      });
      db.objects.set(path, { size: 10, contentType: "image/jpeg", head: JPEG });
      return path;
    };
    const stalePending = seed("stale-pending", "uploading", hoursAgo(25), null);
    const freshPending = seed("fresh-pending", "uploading", hoursAgo(1), null);
    const staleReady = seed("stale-ready", "ready", hoursAgo(24 * 8), null);
    const attachedOld = seed("attached-old", "ready", hoursAgo(24 * 90), "post-9");
    const attachedPending = seed("attached-odd", "uploading", hoursAgo(48), "post-8");

    const result = await cleanupStaleQuadMediaUploads({ now });

    expect(result).toEqual({ pendingReleased: 1, unattachedReadyReleased: 1 });
    expect(db.objects.has(stalePending)).toBe(false);
    expect(db.objects.has(staleReady)).toBe(false);
    expect(db.objects.has(freshPending)).toBe(true);
    expect(db.objects.has(attachedOld)).toBe(true);
    expect(db.objects.has(attachedPending)).toBe(true);
  });
});

describe("post limit", () => {
  it("still rejects attaching more than 15 items to a post", async () => {
    const items = Array.from({ length: 16 }, (_, i) => ({ mediaId: `m-${i}`, sortOrder: i }));
    await expectApiError(
      attachCarouselMediaToPost({ postId: "p", userId: USER, items }),
      400,
      "CAROUSEL_COUNT_INVALID",
    );
  });
});
