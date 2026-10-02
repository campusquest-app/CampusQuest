"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, AuthSessionMissingError } from "@/lib/client/dashboardApi";

/** Reports upload progress as a fraction in [0, 1]. */
export type UploadProgress = (fraction: number) => void;

type ApiEnvelope = { data?: unknown; error?: { message?: string; code?: string }; ok?: boolean };

/** Upload internals (status codes, gateway bodies) are for developers, not students' consoles. */
function devError(label: string, detail: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "production") console.error(label, detail);
}

/**
 * Upload an image Blob/File via multipart/form-data with real upload progress.
 */
export function uploadImageBlob<T = unknown>(args: {
  path: string;
  blob: Blob;
  fileName: string;
  fieldName?: string;
  fields?: Record<string, string>;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
}): Promise<T> {
  const form = new FormData();
  form.append(args.fieldName ?? "file", args.blob, args.fileName);
  if (args.fields) {
    for (const [key, value] of Object.entries(args.fields)) {
      form.append(key, value);
    }
  }
  return uploadFormDataWithProgress<T>({
    path: args.path,
    form,
    onProgress: args.onProgress,
    signal: args.signal,
  });
}

/**
 * XHR send with real upload progress, a stall watchdog, and abort support.
 * Resolves with the raw XHR once a response arrives (any status); callers interpret it.
 */
function sendWithProgress(args: {
  method: "POST" | "PUT";
  url: string;
  body: FormData;
  headers: Record<string, string>;
  withCredentials: boolean;
  logLabel: string;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
  /**
   * Abort when no upload progress / response arrives for this long.
   * Rejects with code UPLOAD_STALLED (never ABORTED, which callers treat as user cancel).
   */
  stallTimeoutMs?: number;
}): Promise<XMLHttpRequest> {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stalled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const clearStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const armStall = () => {
      if (!args.stallTimeoutMs) return;
      clearStall();
      stallTimer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, args.stallTimeoutMs);
    };

    xhr.open(args.method, args.url);
    for (const [name, value] of Object.entries(args.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.responseType = "text";
    xhr.withCredentials = args.withCredentials;

    xhr.upload.onprogress = (event) => {
      armStall();
      if (args.onProgress && event.lengthComputable && event.total > 0) {
        args.onProgress(Math.min(1, event.loaded / event.total));
      }
    };

    xhr.onloadend = clearStall;
    xhr.onload = () => resolve(xhr);

    xhr.onerror = () => {
      devError("[cq][image-upload] network error", { target: args.logLabel });
      reject(
        new ApiRequestError(
          "Network error while uploading. Check your connection and try again.",
          0,
          "NETWORK_ERROR",
        ),
      );
    };

    xhr.onabort = () => {
      clearStall();
      if (stalled) {
        reject(
          new ApiRequestError(
            "Upload stalled. Check your connection and tap Retry.",
            0,
            "UPLOAD_STALLED",
          ),
        );
        return;
      }
      reject(new ApiRequestError("Upload cancelled.", 0, "ABORTED"));
    };

    if (args.signal) {
      if (args.signal.aborted) {
        xhr.abort();
      } else {
        args.signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
    }

    xhr.send(args.body);
    armStall();
  });
}

/**
 * Generic multipart upload with real XHR progress. Surfaces the server's real
 * error message when present — never replaces it with a silent generic.
 */
export async function uploadFormDataWithProgress<T = unknown>(args: {
  path: string;
  form: FormData;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
  stallTimeoutMs?: number;
}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new AuthSessionMissingError();

  const xhr = await sendWithProgress({
    method: "POST",
    url: args.path,
    body: args.form,
    headers: { Authorization: `Bearer ${token}` },
    withCredentials: true,
    logLabel: args.path,
    onProgress: args.onProgress,
    signal: args.signal,
    stallTimeoutMs: args.stallTimeoutMs,
  });

  const rawText = typeof xhr.response === "string" ? xhr.response : "";
  let payload: ApiEnvelope = {};
  try {
    payload = rawText ? (JSON.parse(rawText) as ApiEnvelope) : {};
  } catch (parseError) {
    devError("[cq][image-upload] non-JSON response", {
      path: args.path,
      status: xhr.status,
      bodyPreview: rawText.slice(0, 240),
      parseError,
    });
    // e.g. the hosting platform's plain-text 413 page; details stay in the console log above.
    if (xhr.status === 413) {
      throw new ApiRequestError("This file is too large to upload.", 413, "PAYLOAD_TOO_LARGE");
    }
    throw new ApiRequestError("Upload failed. Please try again.", xhr.status || 500, "NON_JSON_RESPONSE");
  }

  if (xhr.status >= 200 && xhr.status < 300 && payload.data !== undefined) {
    // Back-compat: older servers omitted `ok`; require data either way.
    args.onProgress?.(1);
    return payload.data as T;
  }

  devError("[cq][image-upload] failed", {
    path: args.path,
    status: xhr.status,
    code: payload.error?.code,
    message: payload.error?.message,
  });
  const serverMessage = payload.error?.message?.trim();
  throw new ApiRequestError(
    serverMessage ||
      `Upload failed (HTTP ${xhr.status || "?"}${payload.error?.code ? `, ${payload.error.code}` : ""}).`,
    xhr.status || 500,
    payload.error?.code,
  );
}

const SIGNED_UPLOAD_PATH_MARKER = "/storage/v1/object/upload/sign/";

function assertSupabaseSignedUploadUrl(signedUrl: string): URL {
  let url: URL;
  try {
    url = new URL(signedUrl);
  } catch {
    throw new ApiRequestError("Upload target is invalid.", 0, "UPLOAD_TARGET_INVALID");
  }
  const expectedOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : null;
  if (
    url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1"
  ) {
    throw new ApiRequestError("Upload target is invalid.", 0, "UPLOAD_TARGET_INVALID");
  }
  if ((expectedOrigin && url.origin !== expectedOrigin) || !url.pathname.includes(SIGNED_UPLOAD_PATH_MARKER)) {
    throw new ApiRequestError("Upload target is invalid.", 0, "UPLOAD_TARGET_INVALID");
  }
  return url;
}

/**
 * PUT a file straight to a Supabase Storage signed upload URL (issued by our server) with real
 * progress. Mirrors storage-js `uploadToSignedUrl`, which uses fetch and cannot report progress.
 * The signed URL carries a single-path token; only the public anon key is sent alongside it.
 */
export async function uploadFileToSignedUrl(args: {
  signedUrl: string;
  file: Blob;
  contentType: string;
  upsert?: boolean;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
  stallTimeoutMs?: number;
}): Promise<void> {
  const url = assertSupabaseSignedUploadUrl(args.signedUrl);

  const body = new FormData();
  body.append("cacheControl", "3600");
  // The stored object's content type comes from this part — it must match what the server approved.
  body.append("", new Blob([args.file], { type: args.contentType }));

  const headers: Record<string, string> = { "x-upsert": args.upsert ? "true" : "false" };
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) headers.apikey = anonKey;

  const xhr = await sendWithProgress({
    method: "PUT",
    url: url.toString(),
    body,
    headers,
    withCredentials: false,
    // Never log the signed URL — its query string is an upload credential.
    logLabel: "storage-signed-upload",
    onProgress: args.onProgress,
    signal: args.signal,
    stallTimeoutMs: args.stallTimeoutMs,
  });

  if (xhr.status >= 200 && xhr.status < 300) {
    args.onProgress?.(1);
    return;
  }

  const rawText = typeof xhr.response === "string" ? xhr.response : "";
  let storageMessage = "";
  let storageStatus = "";
  try {
    const parsed = rawText
      ? (JSON.parse(rawText) as { message?: string; error?: string; statusCode?: string | number })
      : {};
    storageMessage = (parsed.message || parsed.error || "").trim();
    storageStatus = String(parsed.statusCode ?? "");
  } catch {
    // Non-JSON gateway response; fall through to a status-based message.
  }
  devError("[cq][image-upload] storage upload failed", { status: xhr.status, message: storageMessage });
  if (xhr.status === 413 || storageStatus === "413") {
    throw new ApiRequestError("This file is too large to upload.", 413, "STORAGE_OBJECT_TOO_LARGE");
  }
  throw new ApiRequestError(
    storageMessage ? `Upload failed: ${storageMessage}` : `Upload failed (HTTP ${xhr.status || "?"}).`,
    xhr.status || 500,
    "STORAGE_UPLOAD_FAILED",
  );
}
