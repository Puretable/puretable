import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { LocationPicker } from "@/components/admin/LocationPicker";
import { useSiteText } from "@/hooks/use-site-settings";
import {
  DAY_KEYS,
  OwnerBusinessInput,
  safetyFieldsChanged,
  type OwnerBusinessDetail,
} from "@/lib/owner-manage.schemas";
import { friendlyPortalError } from "@/lib/owner-portal";
import { pickBilingual } from "@/lib/bilingual";

const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  sun: "الأحد",
  mon: "الاثنين",
  tue: "الثلاثاء",
  wed: "الأربعاء",
  thu: "الخميس",
  fri: "الجمعة",
  sat: "السبت",
};
const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  city: "المدينة",
  phone: "الهاتف",
  whatsapp: "واتساب",
  instagram: "إنستغرام",
  website: "الموقع الإلكتروني",
  maps_url: "رابط الاتجاهات",
  description: "الوصف",
  address: "العنوان",
};

type SafetyLevel = "green" | "red" | "none";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
const inputClass = "mt-2 w-full rounded-xl border bg-background p-3";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border p-4 sm:p-5">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * The owner's listing information. The safety section reuses the same options and wording as the
 * admin business editor. Saving is validated here for fast feedback and again on the server.
 */
export function BusinessInfoForm({
  business,
  save,
  disabled,
}: {
  business: OwnerBusinessDetail;
  save: (input: OwnerBusinessInput) => Promise<unknown>;
  disabled?: boolean;
}) {
  const { text } = useSiteText();
  const s = (v: string | null | undefined) => v ?? "";
  // One box per field: Arabic and English used to be separate inputs writing to separate columns.
  // Now there is a single box per field, prefilled from whichever language already has text
  // (Arabic first), and on save the same text is written to both columns — see submit() below.
  const [f, setF] = useState({
    name: pickBilingual(business.name_ar, business.name),
    description: pickBilingual(business.description_ar, business.description),
    products: pickBilingual(business.products_ar, business.products),
    city: pickBilingual(business.city_ar, business.city),
    district: pickBilingual(business.district_ar, business.district),
    address: pickBilingual(business.address_ar, business.address),
    discount_code: s(business.discount_code),
    lat: business.lat,
    lng: business.lng,
    no_location: business.no_location,
    safety: business.safety as SafetyLevel,
    shared_kitchen: business.shared_kitchen,
    dedicated_gf: business.dedicated_gf,
    hours: { ...business.hours } as Record<string, string>,
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => {
    setMessage("");
    setF((prev) => ({ ...prev, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    const parsed = OwnerBusinessInput.safeParse({
      name: f.name,
      name_ar: f.name,
      description: f.description,
      description_ar: f.description,
      products: f.products,
      products_ar: f.products,
      region: business.region,
      city: f.city,
      city_ar: f.city,
      district: f.district,
      district_ar: f.district,
      address: f.address,
      address_ar: f.address,
      lat: f.lat,
      lng: f.lng,
      hours: Object.fromEntries(Object.entries(f.hours).filter(([, v]) => v.trim() !== "")),
      discount_code: f.discount_code,
      no_location: f.no_location,
      safety: f.safety,
      shared_kitchen: f.shared_kitchen,
      dedicated_gf: f.dedicated_gf,
      // The shared-kitchen note is admin-only (set from the admin pages) — the owner can see it
      // below but not change it, so it is always passed through unchanged from the business's
      // current stored value, never from editable form state.
      precautions_note: business.precautions_note,
    });
    if (!parsed.success) {
      setErrors(
        parsed.error.issues.map((issue) => {
          const key = String(issue.path[0] ?? "");
          return `${FIELD_LABELS[key] ?? key}: ${issue.message}`;
        }),
      );
      return;
    }
    if (
      business.verified &&
      safetyFieldsChanged(business, parsed.data) &&
      !window.confirm(
        "تغيير معلومات السلامة سيسحب شارة «موثّق» من صفحتك حتى تراجعها الإدارة من جديد. هل تريد المتابعة؟",
      )
    )
      return;
    setBusy(true);
    setErrors([]);
    try {
      await save(parsed.data);
      // Show the value exactly as stored (text is trimmed).
      const stored = parsed.data;
      setF((prev) => ({ ...prev, name: stored.name }));
      setMessage("تم حفظ بيانات العمل.");
    } catch (e) {
      setErrors([friendlyPortalError(e)]);
    } finally {
      setBusy(false);
    }
  }

  const safetyOption = (
    level: SafetyLevel,
    dot: string,
    active: string,
    label: string,
    desc: string,
  ) => (
    <button
      key={level}
      type="button"
      role="radio"
      aria-checked={f.safety === level}
      onClick={() => set("safety", level)}
      className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${f.safety === level ? active : "border-border"}`}
    >
      <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
    </button>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <h2 className="text-xl font-semibold">بيانات العمل</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          هذه المعلومات تظهر للزوار على صفحتك، وأنت المسؤول عن دقتها. لا يمكن تغيير الفئة والنشر من
          هنا؛ تتولاها الإدارة.
        </p>
      </div>

      <fieldset disabled={busy || disabled} className="space-y-6">
        <Card title="المعلومات الأساسية">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم العمل *">
              <input
                required
                maxLength={200}
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="الوصف">
              <textarea
                rows={4}
                maxLength={5000}
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="ما تقدمه (نص حر)" hint="مثال: خبز، كيك، معجنات">
              <input
                maxLength={2000}
                value={f.products}
                onChange={(e) => set("products", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="مستوى الأمان (كما تصرّح به المنشأة)">
          <div
            role="radiogroup"
            aria-label="مستوى الأمان"
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          >
            {safetyOption(
              "green",
              "bg-safety-safe",
              "border-safety-safe bg-safety-safe/10",
              text("safety.safe_label"),
              text("safety.safe_desc"),
            )}
            {safetyOption(
              "red",
              "bg-safety-caution",
              "border-safety-caution bg-safety-caution/10",
              text("safety.caution_label"),
              text("safety.caution_desc"),
            )}
            <button
              type="button"
              aria-pressed={f.shared_kitchen}
              onClick={() => set("shared_kitchen", !f.shared_kitchen)}
              className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${f.shared_kitchen ? "border-safety-shared bg-safety-shared/10" : "border-border"}`}
            >
              <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-safety-shared" />
              <span>
                <span className="block font-medium">{text("safety.shared_label")}</span>
                <span className="block text-xs text-muted-foreground">
                  {text("safety.shared_desc")}
                </span>
              </span>
            </button>
            {safetyOption(
              "none",
              "border border-muted-foreground",
              "border-foreground bg-secondary",
              "بدون تقييم",
              "لا تظهر أي نقطة على صفحتك.",
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            هذه المعلومة مقدَّمة من المنشأة ولا تتحقق منها Pure Table. تأكد من دقتها.
          </p>
        </Card>

        <Card title="أكواد الخصم">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="كود الخصم النشط (اختياري)" hint="كود واحد فقط. اتركه فارغاً لإيقافه.">
              <input
                maxLength={80}
                value={f.discount_code}
                onChange={(e) => set("discount_code", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="الموقع">
          <label className="flex items-start gap-2 rounded-xl border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={f.no_location}
              onChange={(e) => set("no_location", e.target.checked)}
            />
            <span>
              <span className="block font-medium">نشاط إلكتروني بدون موقع ثابت</span>
              <span className="block text-xs text-muted-foreground">
                يخفي الخريطة والعنوان وساعات العمل من صفحتك.
              </span>
            </span>
          </label>
          {!f.no_location && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="المدينة *">
                  <input
                    required
                    maxLength={100}
                    value={f.city}
                    onChange={(e) => set("city", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="الحي">
                  <input
                    maxLength={100}
                    value={f.district}
                    onChange={(e) => set("district", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="العنوان">
                  <input
                    maxLength={300}
                    value={f.address}
                    onChange={(e) => set("address", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <LocationPicker
                lat={f.lat}
                lng={f.lng}
                onPick={(lat, lng) => setF((prev) => ({ ...prev, lat, lng }))}
              />
            </>
          )}
        </Card>

        {!f.no_location && (
          <Card title="ساعات العمل">
            <div className="grid gap-4 sm:grid-cols-2">
              {DAY_KEYS.map((day) => (
                <Field key={day} label={DAY_LABELS[day]}>
                  <input
                    dir="ltr"
                    maxLength={60}
                    placeholder="9:00 AM - 10:00 PM"
                    value={f.hours[day] ?? ""}
                    onChange={(e) => set("hours", { ...f.hours, [day]: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>
          </Card>
        )}
      </fieldset>

      {errors.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 ps-5 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      {!disabled && (
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          حفظ التعديلات والنشر
        </button>
      )}
    </form>
  );
}
