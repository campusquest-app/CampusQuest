export const BUSINESS_LOGO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const BUSINESS_LOGO_MAX_BYTES = 25 * 1024 * 1024;

export function businessLogoFileError(file: Pick<File, "type" | "size">): string | null {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  if (!BUSINESS_LOGO_MIME_TYPES.includes(type as (typeof BUSINESS_LOGO_MIME_TYPES)[number])) {
    return "Use a JPEG, PNG, or WebP image.";
  }
  if (file.size <= 0 || file.size > BUSINESS_LOGO_MAX_BYTES) {
    return "This image file is too large.";
  }
  return null;
}
