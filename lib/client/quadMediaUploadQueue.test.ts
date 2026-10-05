import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/apiSession", () => ({
  waitForClientAccessToken: vi.fn(async () => true),
  getAccessToken: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/client/dashboardApi", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/client/dashboardApi")>();
  return { ...actual, postAuthed: vi.fn() };
});

vi.mock("@/lib/client/probeVideoFile", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/client/probeVideoFile")>();
  return {
    ...actual,
    probeVideoFile: vi.fn(),
    captureVideoPoster: vi.fn(),
    videoCodecSupportHints: () => ({ hevc: "", h264: "" }),
  };
});

vi.mock("@/lib/client/prepareQuadImage", () => ({
  prepareQuadImage: vi.fn(async (file: File) => ({
    file: new File([new Uint8Array(8)], file.name, { type: "image/jpeg" }),
    width: 100,
    height: 100,
  })),
}));

vi.mock("@/lib/client/uploadImageWithProgress", () => ({
  uploadFormDataWithProgress: vi.fn(),
  uploadFileToSignedUrl: vi.fn(),
}));

import { ApiRequestError, postAuthed } from "@/lib/client/dashboardApi";
import { captureVideoPoster, probeVideoFile, VideoMediaTimeoutError } from "@/lib/client/probeVideoFile";
import { uploadFileToSignedUrl, uploadFormDataWithProgress } from "@/lib/client/uploadImageWithProgress";
import {
  MEDIA_PREPARE_TIMEOUT_MS,
  MEDIA_UPLOAD_COMPLETE_PATH,
  MEDIA_UPLOAD_DISCARD_PATH,
  MEDIA_UPLOAD_INIT_PATH,
  allCarouselItemsReady,
  canAddMoreItems,
  createCarouselItemFromFile,
  filterNewFiles,
  resetCarouselItemForRetry,
  runCarouselUploadQueue,
  userFacingUploadError,
  type ComposerCarouselItem,
} from "@/lib/client/quadMediaUploadQueue";
import { QUAD_CAROUSEL_MAX_ITEMS } from "@/lib/quadMedia";

const probeMock = vi.mocked(probeVideoFile);
const posterMock = vi.mocked(captureVideoPoster);
const postMock = vi.mocked(postAuthed);
const putMock = vi.mocked(uploadFileToSignedUrl);
const completeMock = vi.mocked(uploadFormDataWithProgress);

type InitBody = { idempotencyKey: string; kind: string; mimeType: string; fileSizeBytes: number; durationSeconds?: number };

function initCalls(): InitBody[] {
  return postMock.mock.calls.filter(([path]) => path === MEDIA_UPLOAD_INIT_PATH).map(([, body]) => body as InitBody);
}

function discardCalls(): unknown[] {
  return postMock.mock.calls.filter(([path]) => path === MEDIA_UPLOAD_DISCARD_PATH).map(([, body]) => body);
}

function iphoneMov(sizeBytes?: number): File {
  const file = new File([new Uint8Array(64)], "IMG_4821.MOV", { type: "video/quicktime" });
  if (sizeBytes) Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function photo(name = "p.jpg"): File {
  return new File([new Uint8Array(8)], name, { type: "image/jpeg" });
}

function tracker() {
  const latest = new Map<string, ComposerCarouselItem>();
  return {
    latest,
    onUpdate: (clientId: string, next: ComposerCarouselItem) => latest.set(clientId, next),
  };
}

/** Server stand-in: one media row per idempotency key (mirrors the unique index). */
let rowsByKey: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  rowsByKey = new Map();
  probeMock.mockImplementation(async (file: File) => ({
    file,
    objectUrl: "blob:probe",
    durationSeconds: 30.4,
    width: 1080,
    height: 1920,
    hasAudio: true,
    mimeType: "video/quicktime",
  }));
  postMock.mockImplementation(async (path: string, body: Record<string, unknown>) => {
    if (path === MEDIA_UPLOAD_INIT_PATH) {
      const key = String(body.idempotencyKey);
      if (!rowsByKey.has(key)) rowsByKey.set(key, `media-${rowsByKey.size + 1}`);
      return {
        status: "upload",
        mediaId: rowsByKey.get(key),
        signedUrl: "https://proj.supabase.co/storage/v1/object/upload/sign/quad-post-images/u/posts/x?token=t",
        contentType: body.mimeType,
        upsert: false,
      };
    }
    return { discarded: true };
  });
  putMock.mockImplementation(async ({ onProgress }) => {
    onProgress?.(0.5);
    onProgress?.(1);
  });
  completeMock.mockImplementation(async ({ form }) => {
    const mediaId = String(form.get("mediaId"));
    return { mediaId, playbackUrl: `https://cdn.test/${mediaId}`, thumbnailUrl: null };
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("direct-to-Storage upload flow", () => {
  it("sends large video bytes straight to Storage — never through the API", async () => {
    const big = iphoneMov(60 * 1024 * 1024);
    const item = createCarouselItemFromFile(big, "video");
    const t = tracker();

    await runCarouselUploadQueue([item], t.onUpdate);

    expect(t.latest.get(item.clientId)?.stage).toBe("ready");
    expect(putMock).toHaveBeenCalledTimes(1);
    // The original file (no transcoding) goes to the signed Storage URL.
    expect(putMock.mock.calls[0]![0].file).toBe(big);
    expect(putMock.mock.calls[0]![0].contentType).toBe("video/quicktime");
    // Our API only receives small JSON (init) and the complete form, which carries no media file.
    expect(initCalls()[0]).toMatchObject({ kind: "video", mimeType: "video/quicktime", fileSizeBytes: big.size });
    expect(completeMock).toHaveBeenCalledTimes(1);
    const completeForm = completeMock.mock.calls[0]![0].form;
    expect(completeMock.mock.calls[0]![0].path).toBe(MEDIA_UPLOAD_COMPLETE_PATH);
    expect(completeForm.get("file")).toBeNull();
    expect(completeForm.get("mediaId")).toBe("media-1");
  });

  it("reports real Storage upload progress, then processing, then ready", async () => {
    const stages: string[] = [];
    const item = createCarouselItemFromFile(photo(), "image");
    await runCarouselUploadQueue([item], (_id, next) => stages.push(`${next.stage}:${next.percent}`));
    expect(stages).toContain("uploading:50");
    expect(stages).toContain("uploading:100");
    expect(stages.indexOf("processing:100")).toBeGreaterThan(stages.indexOf("uploading:50"));
    expect(stages.at(-1)).toBe("ready:100");
  });

  it("marks the item ready only after the server registers it", async () => {
    let releaseComplete!: () => void;
    completeMock.mockImplementationOnce(
      ({ form }) =>
        new Promise((resolve) => {
          releaseComplete = () =>
            resolve({ mediaId: String(form.get("mediaId")), playbackUrl: "https://cdn.test/x", thumbnailUrl: null });
        }),
    );
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();
    const run = runCarouselUploadQueue([item], t.onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(t.latest.get(item.clientId)?.stage).toBe("processing");
    expect(allCarouselItemsReady([t.latest.get(item.clientId)!])).toBe(false);

    releaseComplete();
    await run;
    expect(t.latest.get(item.clientId)?.stage).toBe("ready");
  });

  it("retries a failed registration on the same media row (no duplicate rows)", async () => {
    completeMock.mockRejectedValueOnce(new ApiRequestError("Could not finish the upload.", 500, "MEDIA_READY_FAILED"));
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();

    const run = runCarouselUploadQueue([item], t.onUpdate);
    await vi.runAllTimersAsync();
    await run;

    const final = t.latest.get(item.clientId)!;
    expect(final.stage).toBe("ready");
    expect(final.mediaId).toBe("media-1");
    expect(initCalls()).toHaveLength(2);
    expect(new Set(initCalls().map((b) => b.idempotencyKey)).size).toBe(1);
    expect(rowsByKey.size).toBe(1);
  });

  it("does not auto-retry a validation rejection from registration", async () => {
    completeMock.mockRejectedValue(new ApiRequestError("Uploaded file type does not match.", 400, "MEDIA_CONTENT_TYPE_MISMATCH"));
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();

    const run = runCarouselUploadQueue([item], t.onUpdate);
    await vi.runAllTimersAsync();
    await run;

    const final = t.latest.get(item.clientId)!;
    expect(final.stage).toBe("failed");
    expect(final.uploadMediaId).toBe("media-1");
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("manual Retry keeps the logical item: same idempotency key, same server row", async () => {
    putMock.mockRejectedValue(new ApiRequestError("This file is too large to upload.", 413, "STORAGE_OBJECT_TOO_LARGE"));
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();
    await runCarouselUploadQueue([item], t.onUpdate);
    const failed = t.latest.get(item.clientId)!;
    expect(failed.stage).toBe("failed");

    putMock.mockImplementation(async () => {});
    const retried = resetCarouselItemForRetry(failed);
    expect(retried.idempotencyKey).toBe(item.idempotencyKey);
    expect(retried.stage).toBe("waiting");
    await runCarouselUploadQueue([retried], t.onUpdate);

    expect(t.latest.get(item.clientId)?.stage).toBe("ready");
    expect(t.latest.get(item.clientId)?.mediaId).toBe("media-1");
    expect(rowsByKey.size).toBe(1);
  });

  it("skips the byte upload when the server already has the item ready", async () => {
    postMock.mockImplementation(async (path: string) =>
      path === MEDIA_UPLOAD_INIT_PATH
        ? { status: "ready", media: { mediaId: "media-ready", playbackUrl: "https://cdn.test/r", thumbnailUrl: null } }
        : { discarded: true },
    );
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();
    await runCarouselUploadQueue([item], t.onUpdate);

    expect(t.latest.get(item.clientId)).toMatchObject({ stage: "ready", mediaId: "media-ready" });
    expect(putMock).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("removing an item mid-upload prevents finalization and releases the reservation", async () => {
    putMock.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new ApiRequestError("Upload cancelled.", 0, "ABORTED")));
        }),
    );
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();
    const run = runCarouselUploadQueue([item], t.onUpdate);
    await vi.advanceTimersByTimeAsync(0);

    const inFlight = t.latest.get(item.clientId)!;
    expect(inFlight.stage).toBe("uploading");
    inFlight.abort!.abort();
    await run;

    expect(completeMock).not.toHaveBeenCalled();
    expect(discardCalls()).toEqual([{ mediaId: "media-1" }]);
    expect(t.latest.get(item.clientId)?.stage).not.toBe("ready");
  });

  it("uploads photos (JPEG after client prep) through the same flow", async () => {
    const item = createCarouselItemFromFile(photo("IMG_1.HEIC"), "image");
    const t = tracker();
    await runCarouselUploadQueue([item], t.onUpdate);

    expect(initCalls()[0]).toMatchObject({ kind: "image", mimeType: "image/jpeg" });
    expect(putMock.mock.calls[0]![0].contentType).toBe("image/jpeg");
    expect(t.latest.get(item.clientId)?.stage).toBe("ready");
  });
});

describe("production 413 scenario: phone videos upload without touching the API body limit", () => {
  function videoWithDuration(durationSeconds: number, sizeBytes: number) {
    probeMock.mockImplementationOnce(async (file: File) => ({
      file,
      objectUrl: "blob:probe",
      durationSeconds,
      width: 1080,
      height: 1920,
      hasAudio: true,
      mimeType: "video/quicktime",
    }));
    return createCarouselItemFromFile(iphoneMov(sizeBytes), "video");
  }

  it.each([
    ["30-second", 30.2, 35 * 1024 * 1024],
    ["2:50", 170, 190 * 1024 * 1024],
  ])("a %s video goes straight to Storage and becomes ready", async (_label, duration, size) => {
    const item = videoWithDuration(duration, size);
    const t = tracker();
    await runCarouselUploadQueue([item], t.onUpdate);

    expect(t.latest.get(item.clientId)?.stage).toBe("ready");
    expect(putMock.mock.calls[0]![0].file.size).toBe(size);
    // Only the small init JSON and the media-less complete form reach CampusQuest's API.
    expect(initCalls()[0]).toMatchObject({ durationSeconds: duration, fileSizeBytes: size });
    expect(completeMock.mock.calls[0]![0].form.get("file")).toBeNull();
    for (const [, body] of postMock.mock.calls) {
      expect(JSON.stringify(body).length).toBeLessThan(1000);
    }
  });

  it("refuses a video over the size cap locally, before any upload", async () => {
    const item = createCarouselItemFromFile(iphoneMov(251 * 1024 * 1024), "video");
    const t = tracker();
    await runCarouselUploadQueue([item], t.onUpdate);

    const final = t.latest.get(item.clientId)!;
    expect(final.stage).toBe("failed");
    expect(final.error).toMatch(/^This video file is too large to upload\./);
    expect(initCalls()).toHaveLength(0);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("shows a friendly message after repeated network failures and keeps Retry available", async () => {
    putMock.mockRejectedValue(new ApiRequestError("Network error while uploading.", 0, "NETWORK_ERROR"));
    const item = createCarouselItemFromFile(photo(), "image");
    const t = tracker();
    const run = runCarouselUploadQueue([item], t.onUpdate);
    await vi.runAllTimersAsync();
    await run;

    const final = t.latest.get(item.clientId)!;
    expect(final.stage).toBe("failed");
    expect(final.error).toMatch(/^Upload failed\. Check your connection and tap Retry\./);
    expect(putMock).toHaveBeenCalledTimes(3);
    expect(resetCarouselItemForRetry(final).stage).toBe("waiting");
  });

  it("keeps the other items when one fails", async () => {
    const items = [photo("a.jpg"), photo("b.png"), photo("c.jpg")].map((f) => createCarouselItemFromFile(f, "image"));
    completeMock.mockImplementation(async ({ form }) => {
      const mediaId = String(form.get("mediaId"));
      if (mediaId === "media-2") throw new ApiRequestError("bad", 400, "IMAGE_FORMAT_UNSUPPORTED");
      return { mediaId, playbackUrl: `https://cdn.test/${mediaId}`, thumbnailUrl: null };
    });
    const t = tracker();
    const run = runCarouselUploadQueue(items, t.onUpdate);
    await vi.runAllTimersAsync();
    await run;

    const stages = items.map((i) => t.latest.get(i.clientId)?.stage);
    expect(stages.filter((s) => s === "ready")).toHaveLength(2);
    expect(stages.filter((s) => s === "failed")).toHaveLength(1);
  });
});

describe("student-facing upload errors", () => {
  it.each([
    [new ApiRequestError("Upload failed with HTTP 413 (non-JSON response).", 413, "NON_JSON_RESPONSE"), "video", "This video file is too large to upload."],
    [new ApiRequestError("This file is too large to upload.", 413, "PAYLOAD_TOO_LARGE"), "image", "This photo is too large to upload."],
    [new ApiRequestError("Storage upload failed: bucket quad-post-images", 500, "STORAGE_UPLOAD_FAILED"), "video", "This video couldn’t be uploaded. Please try again."],
    [new ApiRequestError("x", 400, "VIDEO_TOO_LONG"), "video", "This video is longer than the 3-minute limit."],
    [new ApiRequestError("x", 400, "VIDEO_FORMAT_UNSUPPORTED"), "video", "This video format is not supported."],
    [new ApiRequestError("x", 400, "IMAGE_FORMAT_UNSUPPORTED"), "image", "This file type isn’t supported."],
    [new ApiRequestError("x", 0, "UPLOAD_STALLED"), "video", "Upload failed. Check your connection and tap Retry."],
    [new TypeError("Cannot read properties of undefined"), "image", "This photo couldn’t be uploaded. Please try again."],
  ] as const)("maps %s", (error, kind, expected) => {
    expect(userFacingUploadError(error, kind)).toBe(expected);
  });

  it("never echoes HTTP, Supabase, or bucket details", () => {
    const raw = new ApiRequestError("Storage upload failed: new row violates row-level security (quad-post-images)", 403, "X");
    const message = userFacingUploadError(raw, "video");
    expect(message).not.toMatch(/HTTP|supabase|bucket|quad-post-images|row-level/i);
  });
});

describe("video upload never stays in Processing", () => {
  it("uploads the video without a cover when the iOS poster frame times out", async () => {
    posterMock.mockRejectedValue(new VideoMediaTimeoutError("poster", 6000));
    const item = createCarouselItemFromFile(iphoneMov(), "video");
    const t = tracker();

    await runCarouselUploadQueue([item], t.onUpdate);

    const final = t.latest.get(item.clientId)!;
    expect(final.stage).toBe("ready");
    expect(final.mediaId).toBe("media-1");
    expect(allCarouselItemsReady([final])).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(completeMock.mock.calls[0]![0].form.get("poster")).toBeNull();
    expect(initCalls()[0]).toMatchObject({ kind: "video", durationSeconds: 30.4 });
    expect(final).toMatchObject({ durationSeconds: 30.4, width: 1080, height: 1920 });
  });

  it("sends the cover frame with registration when capture succeeds", async () => {
    posterMock.mockResolvedValue(new Blob([new Uint8Array(32)], { type: "image/jpeg" }));
    const item = createCarouselItemFromFile(iphoneMov(), "video");
    await runCarouselUploadQueue([item], tracker().onUpdate);
    expect(completeMock.mock.calls[0]![0].form.get("poster")).toBeInstanceOf(Blob);
  });

  it("fails with Retry instead of hanging when preparation never settles", async () => {
    posterMock.mockImplementation(() => new Promise<Blob>(() => {}));
    const item = createCarouselItemFromFile(iphoneMov(), "video");
    const t = tracker();

    const run = runCarouselUploadQueue([item], t.onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.latest.get(item.clientId)?.stage).toBe("preparing");

    await vi.advanceTimersByTimeAsync(MEDIA_PREPARE_TIMEOUT_MS + 10);
    await run;

    const final = t.latest.get(item.clientId)!;
    expect(final.stage).toBe("failed");
    expect(final.error).toMatch(/took too long/i);
    expect(initCalls()).toHaveLength(0);
    expect(putMock).not.toHaveBeenCalled();
    // Deterministic local timeout: no automatic re-wait.
    expect(probeMock).toHaveBeenCalledTimes(1);
  });
});

describe("multi-media queue", () => {
  it("uploads 6+ items exactly once each, even when re-run before queued items begin", async () => {
    const items = Array.from({ length: 7 }, (_, i) => createCarouselItemFromFile(photo(`p${i}.jpg`), "image"));
    const t = tracker();

    // Simulates the composer effect re-running on every stage change while later items
    // are still "waiting" behind the concurrency limit.
    const first = runCarouselUploadQueue(items, t.onUpdate);
    const second = runCarouselUploadQueue(items, t.onUpdate);
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);

    expect(initCalls()).toHaveLength(7);
    expect(putMock).toHaveBeenCalledTimes(7);
    expect(completeMock).toHaveBeenCalledTimes(7);
    expect(new Set(initCalls().map((b) => b.idempotencyKey)).size).toBe(7);
    expect(items.every((i) => t.latest.get(i.clientId)?.stage === "ready")).toBe(true);
  });

  it("keeps the 15-item post limit", () => {
    const fifteen = Array.from({ length: QUAD_CAROUSEL_MAX_ITEMS }, (_, i) =>
      createCarouselItemFromFile(photo(`p${i}.jpg`), "image"),
    );
    expect(QUAD_CAROUSEL_MAX_ITEMS).toBe(15);
    expect(canAddMoreItems(14)).toBe(true);
    expect(canAddMoreItems(15)).toBe(false);
    const { accepted, rejectedReason } = filterNewFiles(fifteen, [photo("extra.jpg")]);
    expect(accepted).toHaveLength(0);
    expect(rejectedReason).toBeTruthy();
  });
});
