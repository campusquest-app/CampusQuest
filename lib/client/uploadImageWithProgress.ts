"use client";

import { getAccessToken } from "@/lib/client/apiSession";
import { ApiRequestError, AuthSessionMissingError } from "@/lib/client/dashboardApi";

/** Reports upload progress as a fraction in [0, 1]. */
export type UploadProgress = (fraction: number) => void;

type ApiEnvelope = { data?: unknown; error?: { message?: string; code?: string }; ok?: boolean };

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
 * Generic multipart upload with real XHR progress. Surfaces the server's real
 * error message when present — never replaces it with a silent generic.
 */
export function uploadFormDataWithProgress<T = unknown>(args: {
  path: string;
  form: FormData;
  onProgress?: UploadProgress;
  signal?: AbortSignal;
}): Promise<T> {
  const token = getAccessToken();
  if (!token) throw new AuthSessionMissingError();

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", args.path);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "text";
    xhr.withCredentials = true;

    if (args.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          args.onProgress?.(Math.min(1, event.loaded / event.total));
        }
      };
    }

    xhr.onload = () => {
      const rawText = typeof xhr.response === "string" ? xhr.response : "";
      let payload: ApiEnvelope = {};
      try {
        payload = rawText ? (JSON.parse(rawText) as ApiEnvelope) : {};
      } catch (parseError) {
        console.error("[cq][image-upload] non-JSON response", {
          path: args.path,
          status: xhr.status,
          bodyPreview: rawText.slice(0, 240),
          parseError,
        });
        reject(
          new ApiRequestError(
            `Upload failed with HTTP ${xhr.status || "?"} (non-JSON response). The file may be too large for the server.`,
            xhr.status || 500,
            "NON_JSON_RESPONSE",
          ),
        );
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload.data !== undefined) {
        // Back-compat: older servers omitted `ok`; require data either way.
        args.onProgress?.(1);
        resolve(payload.data as T);
        return;
      }

      console.error("[cq][image-upload] failed", {
        path: args.path,
        status: xhr.status,
        code: payload.error?.code,
        message: payload.error?.message,
      });
      const serverMessage = payload.error?.message?.trim();
      reject(
        new ApiRequestError(
          serverMessage ||
            `Upload failed (HTTP ${xhr.status || "?"}${payload.error?.code ? `, ${payload.error.code}` : ""}).`,
          xhr.status || 500,
          payload.error?.code,
        ),
      );
    };

    xhr.onerror = () => {
      console.error("[cq][image-upload] network error", { path: args.path });
      reject(
        new ApiRequestError(
          "Network error while uploading. Check your connection and try again.",
          0,
          "NETWORK_ERROR",
        ),
      );
    };

    xhr.onabort = () => reject(new ApiRequestError("Upload cancelled.", 0, "ABORTED"));

    if (args.signal) {
      if (args.signal.aborted) {
        xhr.abort();
      } else {
        args.signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
    }

    xhr.send(args.form);
  });
}
