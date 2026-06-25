"use client";

/** Shared client helper: validate + read an image File into a data: URL. */
export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file (e.g. JPEG, PNG)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read that image. Try another file."));
    reader.readAsDataURL(file);
  });
}
