import { usePlanDefinitions } from "@/hooks/use-plan-definitions";
import { toFeatures } from "@/lib/subscriptions";
import { useState } from "react";
import type { z } from "zod";
import { BranchInput } from "@/lib/businesses.schemas";
import { branchLimitLabel, remainingBranchSlots, type PlanTier } from "@/lib/plans";
import { LocationPicker } from "./LocationPicker";
import { pickBilingual } from "@/lib/bilingual";
import { extractLatLngFromGoogleMapsUrl } from "@/lib/coordinates";

// maps_url/phone/whatsapp/delivery_url use a normalizing validator (z.preprocess), so their z.input
// type is "unknown" — fine for parsing, not for a plain text input's value. Overridden here to the
// actual string-or-null shape the form works with.
type Branch = Omit<
  z.input<typeof BranchInput>,
  "maps_url" | "phone" | "whatsapp" | "delivery_url"
> & {
  maps_url?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  delivery_url?: string | null;
};
const DAYS = [
  ["sun", "الأحد"],
  ["mon", "الاثنين"],
  ["tue", "الثلاثاء"],
  ["wed", "الأربعاء"],
  ["thu", "الخميس"],
  ["fri", "الجمعة"],
  ["sat", "السبت"],
] as const;
// One box per field: a single input covers both languages — see save() below, which mirrors
// each value into its _ar counterpart so neither column goes stale.
const FIELDS = [
  ["name", "اسم الفرع"],
  ["city", "المدينة"],
  ["district", "الحي"],
  ["address", "العنوان"],
] as const;

export function BranchEditor({
  businessId,
  city,
  existing,
  plan,
  businessWhatsapp,
  onSave,
  onDelete,
}: {
  businessId: string;
  city: string;
  existing: Branch[];
  plan: PlanTier;
  /** Legacy business-level WhatsApp number, used only as a fallback for the missing-number warning. */
  businessWhatsapp?: string | null;
  onSave: (branch: Branch) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { data: catalog } = usePlanDefinitions();
  const features = catalog ? toFeatures(catalog[plan]) : undefined;
  const [draft, setDraft] = useState<Branch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [mapsLink, setMapsLink] = useState("");
  const [mapsLinkError, setMapsLinkError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const slots = remainingBranchSlots(
    plan,
    existing.filter((b) => b.published && !b.permanently_closed).length,
    features,
  );
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const parsed = BranchInput.safeParse({
        ...draft,
        name_ar: draft.name,
        city_ar: draft.city,
        district_ar: draft.district,
        address_ar: draft.address,
      });
      if (!parsed.success) throw new Error("راجع اسم الفرع والإحداثيات والحقول المطلوبة.");
      const normalize = (s?: string | null) => (s || "").trim().toLocaleLowerCase();
      if (
        existing.some(
          (b) =>
            b.id !== draft.id &&
            normalize(b.name) === normalize(draft.name) &&
            normalize(b.address) === normalize(draft.address) &&
            normalize(b.city) === normalize(draft.city),
        )
      ) {
        throw new Error("يوجد فرع بنفس الاسم والعنوان والمدينة. عدّل الفرع الموجود.");
      }
      await onSave(parsed.data);
      setDraft(null);
      setMessage("تم حفظ الفرع.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("حذف هذا الفرع؟ لا يمكن التراجع عن الحذف.")) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(id);
      if (draft?.id === id) setDraft(null);
      setMessage("تم حذف الفرع.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحذف");
    } finally {
      setBusy(false);
    }
  }

  function applyMapsLink() {
    setMapsLinkError("");
    const found = extractLatLngFromGoogleMapsUrl(mapsLink);
    if (!found) {
      setMapsLinkError(
        "لم يتم العثور على إحداثيات في هذا الرابط. جرّب رابطاً من شريط العنوان يحتوي على @ متبوعاً بأرقام.",
      );
      return;
    }
    setDraft((current) => (current ? { ...current, lat: found.lat, lng: found.lng } : current));
    setMapsLink("");
  }

  function useCurrentLocation() {
    setLocateError("");
    if (!navigator.geolocation) {
      setLocateError("المتصفح لا يدعم تحديد الموقع.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft((current) =>
          current
            ? { ...current, lat: pos.coords.latitude, lng: pos.coords.longitude }
            : current,
        );
        setLocating(false);
      },
      () => {
        setLocateError("تعذر الحصول على موقعك الحالي. تأكد من السماح بالوصول للموقع.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-muted-foreground">
        أضف الفروع يدوياً وحدد موقع كل فرع على الخريطة. الحد الأقصى للفروع المنشورة:{" "}
        {branchLimitLabel(plan, features)}. لن تُكتب البيانات قبل الحفظ.
      </p>
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
      {existing.map((branch) => (
        <div key={branch.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{branch.name_ar || branch.name}</p>
            <p className="text-xs text-muted-foreground">{branch.address_ar || branch.address}</p>
            <p className="text-xs">
              {branch.permanently_closed
                ? "مغلق نهائياً"
                : branch.published
                  ? "منشور"
                  : branch.plan_limited
                    ? "مخفي بسبب الباقة"
                    : "مسودة"}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-1"
            onClick={() => {
              setDraft({
                ...branch,
                hours: { ...branch.hours },
                name: pickBilingual(branch.name_ar, branch.name),
                city: pickBilingual(branch.city_ar, branch.city),
                district: pickBilingual(branch.district_ar, branch.district),
                address: pickBilingual(branch.address_ar, branch.address),
              });
              setError(null);
            }}
          >
            تعديل
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded border px-3 py-1 text-destructive"
            onClick={() => branch.id && void remove(branch.id)}
          >
            حذف
          </button>
        </div>
      ))}
      {!draft && (
        <button
          type="button"
          disabled={busy}
          className="rounded-xl border px-4 py-2"
          onClick={() => {
            setDraft({
              business_id: businessId,
              name: "",
              city,
              published: slots !== 0,
              hours: {},
            });
            setError(null);
          }}
        >
          {slots === 0 ? "إضافة فرع كمسودة" : "إضافة فرع"}
        </button>
      )}
      {draft && (
        <fieldset disabled={busy} className="space-y-4 rounded-xl border p-4">
          <legend className="px-2 font-medium">{draft.id ? "تعديل الفرع" : "فرع جديد"}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([key, label]) => (
              <label key={key} className="grid gap-1 text-sm">
                {label}
                <input
                  className="rounded-lg border bg-background p-2"
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            {(["lat", "lng"] as const).map((key) => (
              <label key={key} className="grid gap-1 text-sm">
                {key === "lat" ? "خط العرض" : "خط الطول"}
                <input
                  type="number"
                  step="any"
                  min={key === "lat" ? -90 : -180}
                  max={key === "lat" ? 90 : 180}
                  className="rounded-lg border bg-background p-2"
                  value={draft[key] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            <div className="col-span-full flex flex-wrap items-end gap-2">
              <label className="grid min-w-[14rem] flex-1 gap-1 text-sm">
                الصق رابط خرائط جوجل (اختياري) لتعبئة الإحداثيات
                <input
                  dir="ltr"
                  placeholder="https://www.google.com/maps/@24.71,46.67,15z"
                  className="rounded-lg border bg-background p-2"
                  value={mapsLink}
                  onChange={(e) => {
                    setMapsLink(e.target.value);
                    setMapsLinkError("");
                  }}
                />
              </label>
              <button
                type="button"
                onClick={applyMapsLink}
                disabled={!mapsLink.trim()}
                className="h-fit rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              >
                استخرج الإحداثيات
              </button>
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="h-fit rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              >
                {locating ? "جارٍ التحديد…" : "استخدم موقعي الحالي"}
              </button>
            </div>
            {mapsLinkError && (
              <p className="col-span-full text-xs text-destructive">{mapsLinkError}</p>
            )}
            {locateError && <p className="col-span-full text-xs text-destructive">{locateError}</p>}
            <LocationPicker
              lat={draft.lat ?? null}
              lng={draft.lng ?? null}
              onPick={(lat, lng) =>
                setDraft((current) => (current ? { ...current, lat, lng } : current))
              }
            />
            {DAYS.map(([day, label]) => (
              <label key={day} className="grid gap-1 text-sm">
                {label}
                <input
                  placeholder="09:00–22:00 أو مغلق"
                  className="rounded-lg border bg-background p-2"
                  value={draft.hours?.[day] ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, hours: { ...draft.hours, [day]: e.target.value } })
                  }
                />
              </label>
            ))}
          </div>

          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-medium">طرق التواصل لهذا الفرع</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                الهاتف
                <input
                  dir="ltr"
                  className="rounded-lg border bg-background p-2"
                  value={draft.phone ?? ""}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                رقم واتساب
                <input
                  dir="ltr"
                  className="rounded-lg border bg-background p-2"
                  value={draft.whatsapp ?? ""}
                  onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                الموقع والاتجاهات — https فقط
                <input
                  dir="ltr"
                  placeholder="https://"
                  className="rounded-lg border bg-background p-2"
                  value={draft.maps_url ?? ""}
                  onChange={(e) => setDraft({ ...draft, maps_url: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-medium">الطلب والاستلام لهذا الفرع</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.pickup_enabled ?? false}
                onChange={(e) => setDraft({ ...draft, pickup_enabled: e.target.checked })}
              />
              استلام من المنشأة
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.delivery_enabled ?? false}
                onChange={(e) => setDraft({ ...draft, delivery_enabled: e.target.checked })}
              />
              توصيل
            </label>
            {(draft.pickup_enabled || draft.delivery_enabled) &&
              !draft.whatsapp?.trim() &&
              !businessWhatsapp?.trim() && (
                <p className="text-xs text-destructive">
                  أدخل رقم واتساب لهذا الفرع أعلاه حتى تظهر أزرار الطلب للزوار — بدونه لن يستطيع
                  الزوار إتمام الطلب.
                </p>
              )}
            <p className="text-xs text-muted-foreground">
              يفتح كل خيار محادثة واتساب مباشرة مع المنشأة عند الطلب أو الاستلام.
            </p>
          </div>

          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.published ?? true}
              onChange={(e) =>
                setDraft({ ...draft, published: e.target.checked, plan_limited: false })
              }
            />
            منشور
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.permanently_closed ?? false}
              onChange={(e) => setDraft({ ...draft, permanently_closed: e.target.checked })}
            />
            مغلق نهائياً
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            >
              {busy ? "جارٍ الحفظ…" : "حفظ الفرع"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border px-4 py-2"
            >
              إلغاء
            </button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
