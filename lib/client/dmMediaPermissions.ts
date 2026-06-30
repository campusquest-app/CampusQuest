export type DmMediaPermissionKind = "camera" | "microphone" | "photo_library";

const SETTINGS_HINT =
  "Open your browser or device Settings, find CampusQuest, and enable the permission.";

export function dmPermissionDeniedMessage(kind: DmMediaPermissionKind): string {
  switch (kind) {
    case "camera":
      return `Camera access is off. ${SETTINGS_HINT}`;
    case "photo_library":
      return `Photo library access is off. ${SETTINGS_HINT}`;
    case "microphone":
      return `Microphone access is off. ${SETTINGS_HINT}`;
    default:
      return `Permission denied. ${SETTINGS_HINT}`;
  }
}

export function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: string }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return true;
  }
  const message = "message" in error ? String((error as { message?: string }).message) : "";
  return /permission|not allowed|denied/i.test(message);
}

export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Voice messages are not supported on this device.");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export function pickVoiceRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "audio/webm";
}
