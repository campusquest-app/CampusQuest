import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client/apiSession", () => ({
  getAccessToken: vi.fn(() => "test-token"),
}));

import { uploadFileToSignedUrl, uploadFormDataWithProgress } from "@/lib/client/uploadImageWithProgress";

class SilentXhr {
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  responseType = "";
  withCredentials = false;
  status = 0;
  response = "";
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  respond(status: number, response = "") {
    this.status = status;
    this.response = response;
    this.onload?.();
    this.onloadend?.();
  }
  abort() {
    this.onabort?.();
    this.onloadend?.();
  }
}

let lastXhr: SilentXhr | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "XMLHttpRequest",
    class extends SilentXhr {
      constructor() {
        super();
        lastXhr = this;
      }
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  lastXhr = null;
});

describe("uploadFormDataWithProgress stall watchdog", () => {
  it("rejects with UPLOAD_STALLED (not ABORTED) when the request goes silent", async () => {
    const pending = uploadFormDataWithProgress({ path: "/api/x", form: new FormData(), stallTimeoutMs: 1000 });
    const assertion = expect(pending).rejects.toMatchObject({ code: "UPLOAD_STALLED" });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("keeps waiting while progress keeps arriving", async () => {
    const onProgress = vi.fn();
    const pending = uploadFormDataWithProgress({
      path: "/api/x",
      form: new FormData(),
      stallTimeoutMs: 1000,
      onProgress,
    });
    for (let i = 1; i <= 4; i += 1) {
      await vi.advanceTimersByTimeAsync(800);
      lastXhr!.upload.onprogress?.({ lengthComputable: true, loaded: i, total: 10 });
    }
    expect(onProgress).toHaveBeenCalledTimes(4);

    lastXhr!.respond(200, JSON.stringify({ ok: true, data: { mediaId: "m" } }));
    await expect(pending).resolves.toEqual({ mediaId: "m" });
  });
});

describe("uploadFileToSignedUrl", () => {
  const SIGNED = "https://proj.supabase.co/storage/v1/object/upload/sign/quad-post-images/u/posts/a.mov?token=tok";

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-anon-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("PUTs the file to Storage with real progress and no user/service credentials", async () => {
    const onProgress = vi.fn();
    const file = new File([new Uint8Array(32)], "IMG_1.MOV", { type: "" });
    const pending = uploadFileToSignedUrl({ signedUrl: SIGNED, file, contentType: "video/quicktime", onProgress });
    await vi.advanceTimersByTimeAsync(0);

    expect(lastXhr!.method).toBe("PUT");
    expect(lastXhr!.url).toBe(SIGNED);
    expect(lastXhr!.headers).toEqual({ "x-upsert": "false", apikey: "public-anon-key" });
    const part = (lastXhr!.body as FormData).get("") as Blob;
    expect(part.type).toBe("video/quicktime");
    expect(part.size).toBe(32);

    lastXhr!.upload.onprogress?.({ lengthComputable: true, loaded: 16, total: 32 });
    expect(onProgress).toHaveBeenCalledWith(0.5);
    lastXhr!.respond(200, JSON.stringify({ Key: "quad-post-images/u/posts/a.mov" }));
    await expect(pending).resolves.toBeUndefined();
  });

  it("refuses upload targets outside our Supabase project", async () => {
    await expect(
      uploadFileToSignedUrl({
        signedUrl: "https://evil.example.com/storage/v1/object/upload/sign/x?token=t",
        file: new Blob(["x"]),
        contentType: "image/jpeg",
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_TARGET_INVALID" });
    expect(lastXhr).toBeNull();
  });

  it("surfaces Storage's size rejection as non-retryable", async () => {
    const pending = uploadFileToSignedUrl({ signedUrl: SIGNED, file: new Blob(["x"]), contentType: "video/mp4" });
    await vi.advanceTimersByTimeAsync(0);
    lastXhr!.respond(400, JSON.stringify({ statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" }));
    await expect(pending).rejects.toMatchObject({ code: "STORAGE_OBJECT_TOO_LARGE" });
  });
});
