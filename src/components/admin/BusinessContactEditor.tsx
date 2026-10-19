import { useState } from "react";

/**
 * The 4 business-level contact fields — shared by every branch. Used by both the admin page and
 * the owner portal; the caller decides how a save is performed.
 */
export function BusinessContactEditor({
  businessId,
  website,
  instagram,
  tiktok,
  email,
  onSave,
  disabled,
}: {
  businessId: string;
  website: string | null;
  instagram: string | null;
  tiktok: string | null;
  email: string | null;
  onSave: (input: {
    business_id: string;
    website: string | null;
    instagram: string | null;
    tiktok: string | null;
    email: string | null;
  }) => Promise<unknown>;
  disabled?: boolean;
}) {
  const [f, setF] = useState({
    website: website ?? "",
    instagram: instagram ?? "",
    tiktok: tiktok ?? "",
    email: email ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onSave({
        business_id: businessId,
        website: f.website.trim() || null,
        instagram: f.instagram.trim() || null,
        tiktok: f.tiktok.trim() || null,
        email: f.email.trim() || null,
      });
      setMessage("تم الحفظ.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset disabled={busy || disabled} className="space-y-3 rounded-xl border p-4">
      <legend className="px-2 text-sm font-medium">طرق التواصل المشتركة لكل فروع المنشأة</legend>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          الموقع الإلكتروني — https فقط
          <input
            dir="ltr"
            placeholder="https://"
            className="rounded-lg border bg-background p-2"
            value={f.website}
            onChange={(e) => setF({ ...f, website: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          إنستغرام (معرّف أو رابط)
          <input
            dir="ltr"
            placeholder="username"
            className="rounded-lg border bg-background p-2"
            value={f.instagram}
            onChange={(e) => setF({ ...f, instagram: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          تيك توك (معرّف أو رابط)
          <input
            dir="ltr"
            placeholder="username"
            className="rounded-lg border bg-background p-2"
            value={f.tiktok}
            onChange={(e) => setF({ ...f, tiktok: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          البريد الإلكتروني
          <input
            dir="ltr"
            type="email"
            className="rounded-lg border bg-background p-2"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        {busy ? "جارٍ الحفظ…" : "حفظ طرق التواصل"}
      </button>
    </fieldset>
  );
}
