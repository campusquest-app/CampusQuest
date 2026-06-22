/** Supported DM attachment kinds — only `image` is implemented today. */
export type DmMediaAttachmentKind = "image" | "video" | "voice" | "disappearing_media";

export type DmImagePickSource = "camera" | "library";

export const DM_IMAGE_ACCEPT_MOBILE = "image/*";
export const DM_IMAGE_ACCEPT_DESKTOP = "image/jpeg,image/png,image/webp,image/gif";
export const DM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type DmPendingImageDraft = {
  dataUrl: string;
  source: DmImagePickSource;
  fileName?: string;
};

/** Future attach-menu entries (disabled until implemented). */
export type DmAttachMenuItem = {
  id: string;
  label: string;
  kind: DmMediaAttachmentKind;
  enabled: boolean;
};

export const DM_ATTACH_MENU_ITEMS: DmAttachMenuItem[] = [
  { id: "library", label: "Choose from library", kind: "image", enabled: true },
  { id: "video", label: "Video message", kind: "video", enabled: false },
  { id: "voice", label: "Voice message", kind: "voice", enabled: false },
  { id: "disappearing", label: "Disappearing photo", kind: "disappearing_media", enabled: false },
];

export function imageAcceptAttribute(): string {
  if (typeof navigator === "undefined") return DM_IMAGE_ACCEPT_DESKTOP;
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return mobile ? DM_IMAGE_ACCEPT_MOBILE : DM_IMAGE_ACCEPT_DESKTOP;
}

export function validateDmImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > DM_IMAGE_MAX_BYTES) return "Image must be 5 MB or smaller.";
  return null;
}

export function resetFileInput(input: HTMLInputElement | null) {
  if (input) input.value = "";
}
