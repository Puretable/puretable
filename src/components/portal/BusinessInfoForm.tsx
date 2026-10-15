import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { LocationPicker } from "@/components/admin/LocationPicker";
import { SafetyNote } from "@/components/site/SafetyBadge";
import { DAY_KEYS, OwnerBusinessInput, type OwnerBusinessDetail } from "@/lib/owner-manage.schemas";
import { friendlyPortalError } from "@/lib/owner-portal";

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
  const s = (v: string | null | undefined) => v ?? "";
  const [f, setF] = useState({
    name: business.name,
    name_ar: s(business.name_ar),
    description: s(business.description),
    description_ar: s(business.description_ar),
    products: s(business.products),
    products_ar: s(business.products_ar),
    city: business.city,
    city_ar: s(business.city_ar),
    district: s(business.district),
    district_ar: s(business.district_ar),
    address: s(business.address),
    address_ar: s(business.address_ar),
    phone: s(business.phone),
    whatsapp: s(business.whatsapp),
    instagram: s(business.instagram),
    website: s(business.website),
    maps_url: s(business.maps_url),
    discount_code: s(business.discount_code),
    lat: business.lat,
    lng: business.lng,
    no_location: business.no_location,
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
      name_ar: f.name_ar,
      description: f.description,
      description_ar: f.description_ar,
      products: f.products,
      products_ar: f.products_ar,
      region: business.region,
      city: f.city,
      city_ar: f.city_ar,
      district: f.district,
      district_ar: f.district_ar,
      address: f.address,
      address_ar: f.address_ar,
      lat: f.lat,
      lng: f.lng,
      phone: f.phone,
      whatsapp: f.whatsapp,
      instagram: f.instagram,
      website: f.website,
      maps_url: f.maps_url,
      hours: Object.fromEntries(Object.entries(f.hours).filter(([, v]) => v.trim() !== "")),
      discount_code: f.discount_code,
      no_location: f.no_location,
      // Safety level, shared-kitchen status and its note are admin-only (set from the admin pages)
      // — the owner can view them below but not change them, so these are always passed through
      // unchanged from the business's current values, never from editable form state.
      safety: business.safety,
      shared_kitchen: business.shared_kitchen,
      dedicated_gf: business.dedicated_gf,
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
    setBusy(true);
    setErrors([]);
    try {
      await save(parsed.data);
      // Show the values exactly as stored (links are normalised to https:// and text is trimmed).
      const stored = parsed.data;
      setF((prev) => ({
        ...prev,
        name: stored.name,
        phone: stored.phone ?? "",
        whatsapp: stored.whatsapp ?? "",
        instagram: stored.instagram ?? "",
        website: stored.website ?? "",
        maps_url: stored.maps_url ?? "",
      }));
      setMessage("تم حفظ بيانات العمل.");
    } catch (e) {
      setErrors([friendlyPortalError(e)]);
    } finally {
      setBusy(false);
    }
  }

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
            <Field label="اسم العمل (English) *">
              <input
                required
                dir="ltr"
                maxLength={200}
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="اسم العمل بالعربية">
              <input
                maxLength={200}
                value={f.name_ar}
                onChange={(e) => set("name_ar", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="الوصف (English)">
              <textarea
                rows={4}
                maxLength={5000}
                dir="ltr"
                value={f.description}
                onChange={(e) => set("description", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="الوصف بالعربية">
              <textarea
                rows={4}
                maxLength={5000}
                value={f.description_ar}
                onChange={(e) => set("description_ar", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="ما تقدمه (نص حر، English)" hint="مثال: خبز، كيك، معجنات">
              <input
                maxLength={2000}
                dir="ltr"
                value={f.products}
                onChange={(e) => set("products", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="ما تقدمه بالعربية">
              <input
                maxLength={2000}
                value={f.products_ar}
                onChange={(e) => set("products_ar", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="مستوى الأمان">
          <p className="text-xs text-muted-foreground">
            يحدَّد مستوى الأمان ونص المطبخ المشترك من قِبل إدارة Pure Table فقط. هذا هو المعروض
            حالياً على صفحتك — تواصل معنا إن احتجت تعديله.
          </p>
          <SafetyNote
            level={business.safety}
            sharedKitchen={business.shared_kitchen}
            precautionsNote={business.precautions_note}
          />
        </Card>

        <Card title="التواصل">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الهاتف">
              <input
                dir="ltr"
                inputMode="tel"
                maxLength={40}
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="واتساب (رقم أو رابط)">
              <input
                dir="ltr"
                maxLength={300}
                value={f.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="إنستغرام (اسم الحساب بدون @)">
              <input
                dir="ltr"
                maxLength={300}
                value={f.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="الموقع الإلكتروني">
              <input
                dir="ltr"
                maxLength={2000}
                placeholder="https://"
                value={f.website}
                onChange={(e) => set("website", e.target.value)}
                className={inputClass}
              />
            </Field>
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
                <Field label="المدينة (English) *">
                  <input
                    required
                    dir="ltr"
                    maxLength={100}
                    value={f.city}
                    onChange={(e) => set("city", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="المدينة بالعربية">
                  <input
                    maxLength={100}
                    value={f.city_ar}
                    onChange={(e) => set("city_ar", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="الحي (English)">
                  <input
                    dir="ltr"
                    maxLength={100}
                    value={f.district}
                    onChange={(e) => set("district", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="الحي بالعربية">
                  <input
                    maxLength={100}
                    value={f.district_ar}
                    onChange={(e) => set("district_ar", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="العنوان (English)">
                  <input
                    dir="ltr"
                    maxLength={300}
                    value={f.address}
                    onChange={(e) => set("address", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="العنوان بالعربية">
                  <input
                    maxLength={300}
                    value={f.address_ar}
                    onChange={(e) => set("address_ar", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="رابط الاتجاهات (من خرائط قوقل)">
                  <input
                    dir="ltr"
                    maxLength={2000}
                    placeholder="https://"
                    value={f.maps_url}
                    onChange={(e) => set("maps_url", e.target.value)}
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
