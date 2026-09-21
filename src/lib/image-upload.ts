export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Client-side pre-check (the storage bucket enforces the same limits). Returns a message or null. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "الصور المسموحة: JPG أو PNG أو WebP أو GIF.";
  if (file.size > MAX_IMAGE_BYTES) return "حجم الصورة يتجاوز 10 ميجابايت.";
  return null;
}
