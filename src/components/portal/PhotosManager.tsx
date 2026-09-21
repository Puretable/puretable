import { useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyPortalError } from "@/lib/owner-portal";
import { validateImageFile } from "@/lib/image-upload";

type Sign = (filename: string) => Promise<{ token: string; path: string; readUrl: string }>;

/**
 * Cover photo + gallery. The plan limit counts the cover and the gallery together (the same rule
 * the public page applies), so a Free listing has room for a single cover photo.
 */
export function PhotosManager({
  cover: savedCover,
  gallery: savedGallery,
  limit,
  save,
  sign,
  disabled,
}: {
  cover: string | null;
  gallery: string[];
  limit: number;
  save: (photos: { cover_url: string | null; photos: string[] }) => Promise<unknown>;
  sign: Sign;
  disabled?: boolean;
}) {
  const [cover, setCover] = useState<string | null>(savedCover);
  const [gallery, setGallery] = useState<string[]>(savedGallery);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const used = (cover ? 1 : 0) + gallery.length;
  const room = Math.max(0, limit - used);
  const dirty =
    cover !== savedCover ||
    gallery.length !== savedGallery.length ||
    gallery.some((url, i) => url !== savedGallery[i]);

  async function upload(file: File): Promise<string> {
    const problem = validateImageFile(file);
    if (problem) throw new Error(problem);
    const { token, path, readUrl } = await sign(file.name);
    const { error: uploadError } = await supabase.storage
      .from("business-covers")
      .uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    return readUrl;
  }

  async function onCover(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      // Replacing the cover does not use an extra slot; adding the first one needs room.
      if (!cover && room < 1) throw new Error("Photo limit reached");
      setCover(await upload(file));
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setUploading(false);
    }
  }

  async function onGallery(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const picked = Array.from(files).slice(0, room);
      const urls: string[] = [];
      for (const file of picked) urls.push(await upload(file));
      setGallery((g) => [...g, ...urls]);
      if (picked.length < files.length)
        setError("وصلت إلى الحد الأقصى للصور في باقتك، أُضيف ما يتسع له فقط.");
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await save({ cover_url: cover, photos: gallery });
      setMessage("تم حفظ الصور.");
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="photos-title">
      <div>
        <h2 id="photos-title" className="text-xl font-semibold">
          الصور
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          استخدمت {used} من {limit} صور في باقتك (الغلاف والألبوم معاً). JPG أو PNG أو WebP، حتى 10
          ميجابايت للصورة.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">صورة الغلاف</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-32 w-48 place-items-center overflow-hidden rounded-2xl border bg-secondary/40">
            {cover ? (
              <img src={cover} alt="صورة الغلاف" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          {!disabled && (
            <div className="space-y-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                aria-label="رفع صورة الغلاف"
                disabled={uploading || (!cover && room < 1)}
                onChange={(e) => {
                  void onCover(e.target.files?.[0]);
                  e.target.value = "";
                }}
                className="block text-xs"
              />
              {cover && (
                <button
                  type="button"
                  onClick={() => setCover(null)}
                  className="text-xs text-destructive underline"
                >
                  إزالة الغلاف
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">ألبوم الصور</h3>
        {gallery.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((url) => (
              <li
                key={url}
                className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted"
              >
                <img src={url} alt="" className="h-full w-full object-cover" />
                {!disabled && (
                  <button
                    type="button"
                    aria-label="حذف الصورة"
                    onClick={() => setGallery((g) => g.filter((u) => u !== url))}
                    className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/90 text-destructive shadow"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد صور في الألبوم.</p>
        )}
        {!disabled &&
          (room > 0 ? (
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="إضافة صور إلى الألبوم"
              disabled={uploading}
              onChange={(e) => {
                void onGallery(e.target.files);
                e.target.value = "";
              }}
              className="block text-xs"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              وصلت إلى حد الصور في باقتك. رقِّ الباقة لإضافة المزيد.
            </p>
          ))}
      </div>

      {uploading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ رفع الصور…
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!disabled && (
        <button
          type="button"
          disabled={!dirty || busy || uploading}
          onClick={() => void submit()}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm text-primary-foreground disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          حفظ الصور
        </button>
      )}
    </section>
  );
}
