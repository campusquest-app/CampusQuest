"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, AuthSessionMissingError } from "@/lib/client/dashboardApi";

const IS_DEV = process.env.NODE_ENV !== "production";

/** Reports upload progress as a fraction in [0, 1]. */
export type UploadProgress = (fraction: number) => void;

type ApiEnvelope = { data?: unknown; error?: { message?: string; code?: string } };

/**
 * Upload an image Blob/File via multipart/form-data with real upload progress.
 *
 * Uses XMLHttpRequest because fetch cannot report upload progress. Sends the
 * Bearer token like the rest of the authed API and resolves with the success
 * envelope's `data`. Reusable by any future image-upload component.
 */
export function uploadImageBlob<T = unknown>(args: {
  path: string;
  blob: Blob;
  fileName: string;
  fieldName?: string;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new AuthSessionMissingError();

  const form = new FormData();
  form.append(args.fieldName ?? "file", args.blob, args.fileName);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", args.path);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "json";

    if (args.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          args.onProgress?.(Math.min(1, event.loaded / event.total));
        }
      };
    }

    const friendly = "Couldn't upload your photo. Please try again.";

    xhr.onload = () => {
      const payload = (xhr.response ?? {}) as ApiEnvelope;
      if (xhr.status >= 200 && xhr.status < 300 && payload.data !== undefined) {
        args.onProgress?.(1);
        resolve(payload.data as T);
        return;
      }
      // Always log failures (no secrets in these fields); stack stays dev-only via the thrown error.
      console.error("[cq][image-upload] failed", {
        path: args.path,
        status: xhr.status,
        code: payload.error?.code,
        message: payload.error?.message,
      });
      // Surface the server's descriptive, client-safe message so the UI shows the
      // real reason (bucket missing, unsupported format, too large, etc.).
      const serverMessage = payload.error?.message?.trim();
      reject(
        new ApiRequestError(
          serverMessage || (IS_DEV ? `Upload failed (${xhr.status}).` : friendly),
          xhr.status || 500,
          payload.error?.code,
        ),
      );
    };

    xhr.onerror = () => {
      if (IS_DEV) console.error("[cq][image-upload] network error", { path: args.path });
      reject(new ApiRequestError(friendly, 0, "NETWORK_ERROR"));
    };

    xhr.onabort = () => reject(new ApiRequestError("Upload cancelled.", 0, "ABORTED"));

    if (args.signal) {
      if (args.signal.aborted) {
        xhr.abort();
      } else {
        args.signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
    }

    xhr.send(form);
  });
}
