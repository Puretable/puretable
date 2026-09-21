import { useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteText } from "@/hooks/use-site-settings";
import { MenuSafetyBadge } from "@/components/site/MenuSection";
import { MENU_SAFETY_STYLE, formatMenuPrice } from "@/lib/menu-safety";
import {
  MENU_SAFETY,
  MenuItemInput,
  type MenuItem,
  type MenuSafety,
} from "@/lib/owner-manage.schemas";
import { friendlyPortalError } from "@/lib/owner-portal";
import { validateImageFile } from "@/lib/image-upload";

export type MenuManagerProps = {
  businessId: string;
  items: MenuItem[];
  /** Persist a new or edited item. */
  save: (input: MenuItemInput) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  /** Returns a signed upload for one image file. */
  sign: (filename: string) => Promise<{ token: string; path: string; readUrl: string }>;
  disabled?: boolean;
};

type Draft = {
  id?: string;
  name: string;
  name_ar: string;
  price: string;
  photo_url: string | null;
  safety: MenuSafety;
};

const EMPTY: Draft = { name: "", name_ar: "", price: "", photo_url: null, safety: "red" };

/**
 * Gluten-free menu editor. Same component for owners (portal) and admins (business page): the caller
 * supplies save / remove / sign, so authorisation always stays on the server.
 */
export function MenuManager({ businessId, items, save, remove, sign, disabled }: MenuManagerProps) {
  const { text } = useSiteText();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const safetyText: Record<MenuSafety, { label: string; desc: string }> = {
    green: { label: text("safety.safe_label"), desc: text("safety.safe_desc") },
    orange: { label: text("safety.shared_label"), desc: text("safety.shared_desc") },
    red: { label: text("safety.caution_label"), desc: text("safety.caution_desc") },
  };

  function edit(item: MenuItem | null) {
    setError("");
    setMessage("");
    setDraft(
      item
        ? {
            id: item.id,
            name: item.name,
            name_ar: item.name_ar ?? "",
            price: item.price === null ? "" : String(item.price),
            photo_url: item.photo_url,
            safety: item.safety,
          }
        : { ...EMPTY },
    );
  }

  async function onFile(file: File | undefined) {
    if (!file || !draft) return;
    const problem = validateImageFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const { token, path, readUrl } = await sign(file.name);
      const { error: uploadError } = await supabase.storage
        .from("business-covers")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      setDraft((d) => (d ? { ...d, photo_url: readUrl } : d));
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || uploading) return;
    const price = draft.price.trim() === "" ? null : Number(draft.price.replace(",", "."));
    const parsed = MenuItemInput.safeParse({
      id: draft.id,
      business_id: businessId,
      name: draft.name,
      name_ar: draft.name_ar,
      price,
      photo_url: draft.photo_url,
      safety: draft.safety,
      sort_order: draft.id ? (items.find((i) => i.id === draft.id)?.sort_order ?? 0) : items.length,
    });
    if (!parsed.success || (price !== null && Number.isNaN(price))) {
      setError("راجع اسم الصنف والسعر (أرقام فقط) ولا تستخدم الرمزين < >.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await save(parsed.data);
      setMessage(draft.id ? "تم تحديث الصنف." : "تمت إضافة الصنف.");
      setDraft(null);
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  async function del(item: MenuItem) {
    if (!window.confirm(`حذف «${item.name_ar || item.name}» من القائمة؟`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await remove(item.id);
      if (draft?.id === item.id) setDraft(null);
      setMessage("تم حذف الصنف.");
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="menu-manager-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="menu-manager-title" className="text-xl font-semibold">
            قائمة الطعام الخالية من الجلوتين
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            تظهر أصنافك لزوار صفحتك في جميع الباقات. أنت المسؤول عن دقة الاسم والسعر ومستوى الأمان.
          </p>
        </div>
        {!disabled && !draft && (
          <button
            type="button"
            onClick={() => edit(null)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> إضافة صنف
          </button>
        )}
      </div>

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

      {draft && (
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-primary/30 bg-primary-soft p-4 sm:p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{draft.id ? "تعديل صنف" : "صنف جديد"}</h3>
            <button
              type="button"
              aria-label="إغلاق"
              onClick={() => setDraft(null)}
              className="grid h-9 w-9 place-items-center rounded-full border bg-background"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              اسم الصنف (English) *
              <input
                required
                maxLength={120}
                dir="ltr"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-2 w-full rounded-xl border bg-background p-3"
              />
            </label>
            <label className="block text-sm">
              اسم الصنف بالعربية
              <input
                maxLength={120}
                value={draft.name_ar}
                onChange={(e) => setDraft({ ...draft, name_ar: e.target.value })}
                className="mt-2 w-full rounded-xl border bg-background p-3"
              />
            </label>
            <label className="block text-sm">
              السعر (ريال سعودي)
              <input
                inputMode="decimal"
                dir="ltr"
                placeholder="مثال: 25.50"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className="mt-2 w-full rounded-xl border bg-background p-3"
              />
            </label>
            <div className="text-sm">
              صورة الصنف
              <div className="mt-2 flex items-center gap-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-background">
                  {draft.photo_url ? (
                    <img src={draft.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    aria-label="رفع صورة الصنف"
                    className="block w-full text-xs"
                    disabled={uploading}
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                  {uploading && (
                    <p
                      role="status"
                      className="flex items-center gap-1 text-xs text-muted-foreground"
                    >
                      <Loader2 className="h-3 w-3 animate-spin" /> جارٍ الرفع…
                    </p>
                  )}
                  {draft.photo_url && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, photo_url: null })}
                      className="text-xs text-destructive underline"
                    >
                      إزالة الصورة
                    </button>
                  )}
                </div>
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="text-sm font-medium">مستوى الأمان لهذا الصنف</div>
            <div role="radiogroup" aria-label="مستوى الأمان" className="grid gap-2 sm:grid-cols-3">
              {MENU_SAFETY.map((level) => {
                const style = MENU_SAFETY_STYLE[level];
                const on = draft.safety === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDraft({ ...draft, safety: level })}
                    className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${on ? `${style.border} bg-background shadow-sm` : "border-border bg-background/60"}`}
                  >
                    <span
                      className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
                    />
                    <span>
                      <span className="block font-medium">{safetyText[level].label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {safetyText[level].desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || uploading}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {draft.id ? "حفظ التعديلات" : "إضافة الصنف"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="min-h-11 rounded-full border bg-background px-5 text-sm"
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {items.length === 0 && !draft ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          لم تضف أي صنف بعد. أضف أصنافك الخالية من الجلوتين لتظهر لزوار صفحتك.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-2xl border bg-background p-3">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-secondary/40">
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    alt={item.name_ar || item.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Camera className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{item.name_ar || item.name}</p>
                    {item.name_ar && (
                      <p dir="ltr" className="break-words text-start text-xs text-muted-foreground">
                        {item.name}
                      </p>
                    )}
                  </div>
                  {item.price !== null && (
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {formatMenuPrice(item, "ar")}
                    </span>
                  )}
                </div>
                <MenuSafetyBadge level={item.safety} />
                {!disabled && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => edit(item)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs"
                    >
                      <Pencil className="h-3 w-3" /> تعديل
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void del(item)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs text-destructive"
                    >
                      <Trash2 className="h-3 w-3" /> حذف
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
