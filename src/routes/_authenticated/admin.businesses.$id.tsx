import { usePlanDefinitions } from "@/hooks/use-plan-definitions";
import { toFeatures, planSummary } from "@/lib/subscriptions";
import { BusinessPlanControl } from "@/components/admin/BusinessPlanControl";
import { BusinessOwnersPanel } from "@/components/admin/BusinessOwnersPanel";
import { AdminMenuPanel } from "@/components/admin/AdminMenuPanel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  adminGetBusiness,
  upsertBusiness,
  upsertLink,
  deleteLink,
  upsertBranch,
  deleteBranch,
} from "@/lib/businesses.functions";
import { signCoverUploadUrl } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { LocationPicker } from "@/components/admin/LocationPicker";
import { BranchEditor } from "@/components/admin/BranchEditor";
import { LinksEditor } from "@/components/admin/LinksEditor";
import { MAIN_CITIES, findCity, regionForCity } from "@/lib/saudi";
import { adminListPlaceCategories } from "@/lib/category.functions";
import { useSiteText } from "@/hooks/use-site-settings";

import { logAudit } from "@/lib/audit";
import { getBusinessReport } from "@/lib/analytics.dashboard.functions";
import { RANGES, RANGE_LABELS, type RangeKey } from "@/lib/analytics.ranges";
import { downloadBusinessReportPdf } from "@/lib/export-pdf";

import {
  ArrowLeft,
  Upload,
  Loader2,
  Save,
  X,
  FileText,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/businesses/$id")({
  component: EditBusiness,
});

import { PLAN_FEATURES, PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/lib/plans";

const DEFAULT_HOURS = { sun: "", mon: "", tue: "", wed: "", thu: "", fri: "", sat: "" };
const DEFAULT_FORM = {
  slug: "",
  name: "",
  name_ar: "",
  category: "",
  categories: [] as string[],
  city: "Riyadh",
  cities: [] as string[],
  city_ar: "الرياض",
  region: null as string | null,
  address: "",
  address_ar: "",
  lat: null as number | null,
  lng: null as number | null,
  phone: "",
  whatsapp: "",
  instagram: "",
  website: "",
  maps_url: "",
  cover_url: "",
  description: "",
  description_ar: "",
  products: "",
  products_ar: "",
  shared_kitchen: false,
  precautions_note: "",
  hours: { ...DEFAULT_HOURS },
  verified: false,
  safety: "red",
  dedicated_gf: false,
  no_location: false,
  published: false,
  // Manual subscription tier — changed here only, no online payment involved.
  plan: "free" as PlanTier,
  offers_booking: false,
  discount_code: "",
  // Gallery photos (cover excluded) — how many are shown depends on the plan.
  photos: [] as string[],
};

/** Default visitor-facing text for the orange (shared kitchen) dot — editable per business. */
const DEFAULT_SHARED_NOTE = "مطبخ مشترك لكن المطبخ والأدوات مفصولة";

const DAYS = [
  ["sun", "Sunday"],
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
] as const;

function EditBusiness() {
  const { text } = useSiteText();
  const { data: planCatalog } = usePlanDefinitions();
  const planFeatures = (tier: PlanTier) =>
    planCatalog ? toFeatures(planCatalog[tier]) : PLAN_FEATURES[tier];
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = id === "new";

  const load = useServerFn(adminGetBusiness);
  const save = useServerFn(upsertBusiness);
  const saveLink = useServerFn(upsertLink);
  const removeLink = useServerFn(deleteLink);
  const saveBranch = useServerFn(upsertBranch);
  const removeBranch = useServerFn(deleteBranch);
  const signUpload = useServerFn(signCoverUploadUrl);
  const loadCategories = useServerFn(adminListPlaceCategories);
  const { data: categoryCatalog = [] } = useQuery({
    queryKey: ["admin-place-categories"],
    queryFn: () => loadCategories(),
  });
  const mainOptions = categoryCatalog.filter(
    (category) => category.level === "main" && !["featured", "nearby"].includes(category.behavior),
  );
  const automaticMain = categoryCatalog.filter(
    (category) => category.level === "main" && ["featured", "nearby"].includes(category.behavior),
  );
  const secondaryOptions = categoryCatalog.filter((category) => category.level === "sub");

  const { data: existing } = useQuery({
    queryKey: ["admin-business", id],
    queryFn: () => load({ data: { id } }),
    enabled: !isNew,
  });

  const [form, setForm] = useState<any>(DEFAULT_FORM);
  const initializedBusiness = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing && initializedBusiness.current !== existing.id) {
      initializedBusiness.current = existing.id;
      setForm({
        ...DEFAULT_FORM,
        ...existing,
        categories: [
          ...new Set(
            [
              existing.category,
              ...(((existing as any).categories ?? []) as string[]),
              ...(existing.offers_booking ? ["svc_dine_in"] : []),
            ].filter(Boolean),
          ),
        ],
        cities: ((existing as any).cities ?? []) as string[],
        photos: ((existing as any).photos ?? []) as string[],
        hours: { ...DEFAULT_HOURS, ...(existing.hours as object) },
      });
    }
  }, [existing]);

  const links = existing?.business_links ?? [];
  const branches = ((existing as any)?.business_branches ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const selectedPlan = (form.plan ?? "free") as PlanTier;

  // The region is never edited by hand — it is derived from the selected city.
  const regionKey: string | null = regionForCity(form.city) ?? form.region ?? null;

  // The first ticked category / city is the primary one stored on the row.
  const selectedCategories: string[] = [
    ...new Set<string>([form.category, ...(form.categories ?? [])].filter(Boolean)),
  ];
  const selectedCities: string[] = [
    ...new Set<string>([form.city, ...(form.cities ?? [])].filter(Boolean)),
  ];

  function up<K extends string>(k: K, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  /** Main and sub choices share one compatibility array; `category` keeps the first sub choice. */
  function toggleCategory(cat: string, level: "main" | "sub", behavior: string) {
    setForm((f: any) => {
      const current = [...new Set<string>([f.category, ...(f.categories ?? [])].filter(Boolean))];
      const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
      const subValues = new Set(secondaryOptions.map((category) => category.value));
      const subs = next.filter((value) => subValues.has(value));
      if (level === "sub" && subs.length === 0) return f;
      return {
        ...f,
        category: subs[0] ?? f.category,
        categories: next,
        offers_booking: behavior === "booking" ? next.includes(cat) : f.offers_booking,
      };
    });
  }

  /** Tick / untick a city. At least one city always stays selected. */
  function toggleCity(cityEn: string) {
    setForm((f: any) => {
      const current = [...new Set<string>([f.city, ...(f.cities ?? [])].filter(Boolean))];
      const next = current.includes(cityEn)
        ? current.filter((c) => c !== cityEn)
        : [...current, cityEn];
      if (next.length === 0) return f;
      const main = findCity(next[0]!);
      return {
        ...f,
        city: main?.en ?? next[0],
        city_ar: main?.ar ?? next[0],
        region: main?.region ?? null,
        cities: next,
      };
    });
  }

  /** Save, either as a hidden draft or published to the public site. */
  async function submit(publish: boolean) {
    if (
      publish &&
      !existing?.published &&
      !window.confirm("هل حصلت على موافقة المحل؟ بالنشر سيظهر للزوار في قسمه والبحث.")
    )
      return;
    setSaving(true);
    setErr(null);
    setSavedMessage(null);
    try {
      const subValues = new Set(secondaryOptions.map((category) => category.value));
      const selectedSubs = selectedCategories.filter((value) => subValues.has(value));
      if (selectedSubs.length === 0) {
        throw new Error("اختر تصنيفًا فرعيًا واحدًا على الأقل قبل الحفظ.");
      }
      const payload = { ...form };
      payload.published = publish;
      payload.region = regionKey;
      payload.category = selectedSubs[0];
      payload.categories = selectedCategories;
      payload.offers_booking = mainOptions.some(
        (category) =>
          category.behavior === "booking" && selectedCategories.includes(category.value),
      );
      payload.cities = selectedCities;
      payload.dedicated_gf = payload.safety === "green";
      if (payload.no_location) {
        payload.lat = null;
        payload.lng = null;
        payload.maps_url = null;
        payload.hours = {};
      }

      if (isNew) delete payload.id;
      const saved = await save({ data: payload });

      void logAudit(
        isNew ? "create_business" : publish ? "publish_business" : "save_business_draft",
        "business",
        saved.id,
        payload.name,
      );
      qc.invalidateQueries({ queryKey: ["admin-businesses"] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
      if (isNew) {
        await navigate({ to: "/admin/businesses/$id", params: { id: saved.id } });
      } else {
        await qc.invalidateQueries({ queryKey: ["admin-business", id] });
        setForm((f: any) => ({ ...f, published: publish }));
        const status = (saved as any).branch_status;
        const branchMessage = status?.hiddenByPlan
          ? ` تم إخفاء ${status.hiddenByPlan} فرع تلقائياً بسبب حد الباقة، وستعود تلقائياً عند رفعها.`
          : "";
        setSavedMessage(
          publish
            ? `تم الحفظ والنشر وتطبيق مزايا ${PLAN_LABELS[selectedPlan]}.${branchMessage}`
            : `تم الحفظ كمسودة وتطبيق مزايا ${PLAN_LABELS[selectedPlan]}.${branchMessage}`,
        );
      }
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File) {
    const { token, path, readUrl } = await signUpload({ data: { filename: file.name } });
    const { error } = await supabase.storage
      .from("business-covers")
      .uploadToSignedUrl(path, token, file, {
        contentType: file.type || "application/octet-stream",
      });
    if (error) throw error;
    return readUrl as string;
  }

  async function onUpload(file: File) {
    setUploading(true);
    setErr(null);
    try {
      up("cover_url", await uploadFile(file));
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /** Gallery photos. The cover counts towards the plan limit. */
  async function onUploadGallery(files: FileList) {
    setUploading(true);
    setErr(null);
    try {
      const limit = planFeatures((form.plan ?? "free") as PlanTier).photoLimit - 1;
      const current: string[] = form.photos ?? [];
      const room = Math.max(0, limit - current.length);
      const picked = Array.from(files).slice(0, room);
      const urls: string[] = [];
      for (const f of picked) urls.push(await uploadFile(f));
      up("photos", [...current, ...urls]);
      if (picked.length < files.length)
        setErr("تم تجاوز عدد الصور المسموح في هذه الباقة — أُضيف ما يسمح به فقط.");
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> رجوع / Back
          </button>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            {isNew ? "New business" : form.name || "Edit"}
          </h1>
          {!isNew && (existing as any)?.updated_at && (
            <p className="mt-1 text-xs text-muted-foreground">
              آخر تعديل / Last updated:{" "}
              <span dir="ltr">{new Date((existing as any).updated_at).toLocaleString()}</span>
            </p>
          )}
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {err}
        </div>
      )}
      {savedMessage && (
        <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          {savedMessage}
        </div>
      )}

      {/* Why this record was flagged, with a clear way to clear the flag. */}
      {(form as any).needs_review && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">يحتاج مراجعة / Needs review</p>
              {((form as any).review_notes as string[] | undefined)?.length ? (
                <ul className="list-disc space-y-0.5 ps-4">
                  {((form as any).review_notes as string[]).map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p>لم يتم تحديد السبب — راجع البيانات الناقصة.</p>
              )}
              <button
                type="button"
                onClick={() => {
                  up("needs_review", false);
                  up("review_notes", []);
                }}
                className="mt-1 rounded-full border border-destructive/40 px-3 py-1 text-xs"
              >
                تم الإصلاح / Mark as reviewed
              </button>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(true);
        }}
        className="space-y-6"
      >
        <Section title="Cover photo">
          {form.cover_url ? (
            <img src={form.cover_url} alt="" className="mb-3 h-40 w-full rounded-xl object-cover" />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary/40"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}{" "}
              Upload photo
            </button>
            <Input
              label="or paste URL"
              value={form.cover_url ?? ""}
              onChange={(v) => up("cover_url", v)}
              className="flex-1 min-w-[240px]"
              inline
            />
          </div>
        </Section>

        <Section title="ألبوم الصور / Photo gallery">
          <p className="mb-3 text-xs text-muted-foreground">
            عدد الصور مرتبط بالباقة (صورة الغلاف محسوبة ضمنها): Free = 1، Pro / الأسر المنتجة = 8،
            Premium = 15. الحد الحالي لهذه الباقة:{" "}
            {planFeatures((form.plan ?? "free") as PlanTier).photoLimit} صورة — المستخدم الآن:{" "}
            {1 + ((form.photos ?? []) as string[]).length}.
          </p>
          {((form.photos ?? []) as string[]).length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {((form.photos ?? []) as string[]).map((src, i) => (
                <div
                  key={src + i}
                  className="relative overflow-hidden rounded-xl border border-border"
                >
                  <img src={src} alt="" className="h-24 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      up(
                        "photos",
                        ((form.photos ?? []) as string[]).filter((_, j) => j !== i),
                      )
                    }
                    className="absolute end-1 top-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-destructive"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => e.target.files?.length && onUploadGallery(e.target.files)}
          />
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={
              uploading ||
              1 + ((form.photos ?? []) as string[]).length >=
                planFeatures((form.plan ?? "free") as PlanTier).photoLimit
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary/40 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}{" "}
            إضافة صور / Add photos
          </button>
        </Section>

        <Section title="المعلومات الأساسية / Basics">
          <Grid>
            <Input
              label="الاسم / Name"
              required
              value={form.name}
              onChange={(v) => up("name", v)}
            />
            <Input
              label="رابط الصفحة (اختياري) / Slug — optional"
              value={form.slug}
              onChange={(v) => up("slug", v.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}
            />

            <div className="col-span-full grid gap-5 rounded-2xl border border-border p-4">
              {[
                {
                  title: "التصنيفات الرئيسية / Main categories",
                  hint: "اختر طريقة ظهور المشروع في الخيارات الكبيرة أعلى الصفحة.",
                  level: "main" as const,
                  options: mainOptions,
                },
                {
                  title: "التصنيفات الفرعية / Subcategories *",
                  hint: "اختر نوعًا واحدًا على الأقل، ويمكن اختيار أكثر من نوع.",
                  level: "sub" as const,
                  options: secondaryOptions,
                },
              ].map((group) => (
                <div key={group.level} className="space-y-2">
                  <div className="text-sm font-semibold">{group.title}</div>
                  <div className="text-xs text-muted-foreground">{group.hint}</div>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((category) => {
                      const on = selectedCategories.includes(category.value);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() =>
                            toggleCategory(category.value, group.level, category.behavior)
                          }
                          aria-pressed={on}
                          className={`rounded-full border px-3 py-2 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/40"}`}
                        >
                          {on ? "✓ " : "+ "}
                          {category.name_ar} / {category.name_en}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {automaticMain.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  تلقائيًا: {automaticMain.map((category) => category.name_ar).join("، ")}؛ تُحدد
                  حسب الموقع أو الباقة ولا تحتاج اختيارًا هنا.
                </p>
              )}
            </div>

            {/* Same pattern for cities — a chain can be ticked in several cities. */}
            <div className="col-span-full space-y-2">
              <div className="text-sm font-medium">
                المدن / Cities{" "}
                <span className="text-xs text-muted-foreground">(اختر أكثر من مدينة)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MAIN_CITIES.map((c) => {
                  const on = selectedCities.includes(c.en);
                  return (
                    <button
                      key={c.en}
                      type="button"
                      onClick={() => toggleCity(c.en)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
                    >
                      {on ? "✓ " : "+ "}
                      {c.ar}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-full space-y-2">
              <div className="text-sm font-medium">مستوى الأمان / Safety level</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => up("safety", "green")}
                  className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${form.safety === "green" ? "border-safety-safe bg-safety-safe/10" : "border-border"}`}
                >
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-safety-safe" />
                  <span>
                    <span className="block font-medium">{text("safety.safe_label")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {text("safety.safe_desc")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => up("safety", "red")}
                  className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${form.safety === "red" ? "border-safety-caution bg-safety-caution/10" : "border-border"}`}
                >
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-safety-caution" />
                  <span>
                    <span className="block font-medium">{text("safety.caution_label")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {text("safety.caution_desc")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f: any) => ({
                      ...f,
                      shared_kitchen: !f.shared_kitchen,
                      precautions_note: f.precautions_note?.trim()
                        ? f.precautions_note
                        : DEFAULT_SHARED_NOTE,
                    }))
                  }
                  className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${form.shared_kitchen ? "border-safety-shared bg-safety-shared/10" : "border-border"}`}
                >
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-safety-shared" />
                  <span>
                    <span className="block font-medium">{text("safety.shared_label")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {text("safety.shared_desc")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => up("safety", "none")}
                  className={`flex items-start gap-2 rounded-xl border p-3 text-start text-sm ${form.safety === "none" ? "border-foreground bg-secondary" : "border-border"}`}
                >
                  <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-muted-foreground" />
                  <span>
                    <span className="block font-medium">بدون تقييم</span>
                    <span className="block text-xs text-muted-foreground">
                      لا تظهر أي نقطة على هذا المشروع.
                    </span>
                  </span>
                </button>
              </div>
              {form.shared_kitchen && (
                <Textarea
                  label="نص المطبخ المشترك (يظهر للزائر) / Shared kitchen note"
                  value={form.precautions_note ?? ""}
                  onChange={(v) => up("precautions_note", v)}
                />
              )}
            </div>
          </Grid>
        </Section>

        <Section title="Description">
          <Grid>
            <Textarea
              label="الوصف / Description"
              value={form.description ?? ""}
              onChange={(v) => up("description", v)}
            />
          </Grid>
        </Section>

        <Section title="الباقة / Subscription plan">
          {isNew ? (
            <>
              <label className="grid gap-2 text-sm">
                الباقة عند إنشاء العمل
                <select
                  value={selectedPlan}
                  onChange={(event) => up("plan", event.target.value)}
                  className="rounded-lg border bg-background p-3"
                >
                  {PLAN_TIERS.map((tier) => (
                    <option key={tier} value={tier}>
                      {PLAN_LABELS[tier]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {planSummary(planFeatures(selectedPlan))}
              </p>
            </>
          ) : (
            <BusinessPlanControl
              businessId={id}
              name={form.name}
              currentPlan={existing?.plan ?? selectedPlan}
              onChanged={(tier) => {
                up("plan", tier);
                void qc.invalidateQueries({ queryKey: ["admin-business", id] });
              }}
            />
          )}
        </Section>

        {!isNew && <BusinessPerformance businessId={id} name={form.name} plan={selectedPlan} />}
      </form>

      {!isNew && <BusinessOwnersPanel businessId={id} />}
      {!isNew && <AdminMenuPanel businessId={id} />}

      {!isNew && (
        <Section title="Action buttons (order & contact links)">
          <p className="text-xs text-muted-foreground">
            Paste the exact product URL from each platform. Each click is tracked before
            redirecting. Auto-generated buttons (Call, Instagram, Directions) don't need to be added
            here.
          </p>
          <LinksEditor
            businessId={id}
            links={links}
            branches={branches}
            onSave={async (row) => {
              await saveLink({ data: row });
              qc.invalidateQueries({ queryKey: ["admin-business", id] });
            }}
            onDelete={async (linkId) => {
              await removeLink({ data: { id: linkId } });
              qc.invalidateQueries({ queryKey: ["admin-business", id] });
            }}
          />
        </Section>
      )}

      <Section title="Contact & location">
        <Grid>
          <Input
            label="كود الخصم النشط (اختياري) / Active discount code"
            value={form.discount_code ?? ""}
            onChange={(v) => up("discount_code", v)}
            className="sm:col-span-2"
          />
          <p className="col-span-full -mt-2 text-xs text-muted-foreground">
            كود واحد فقط لكل نشاط. اترك الخانة فارغة لإيقافه.
          </p>
          <label className="col-span-full flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!form.no_location}
              onChange={(e) => up("no_location", e.target.checked)}
            />
            <span>
              <span className="block font-medium">
                No physical location (online / cloud business)
              </span>
              <span className="block text-xs text-muted-foreground">
                بدون موقع ثابت — يخفي الخريطة والعنوان وساعات العمل وزر "افتح في الخرائط" من صفحة
                النشاط.
              </span>
            </span>
          </label>
          <Input label="Phone" value={form.phone ?? ""} onChange={(v) => up("phone", v)} />
          <Input
            label="واتساب / WhatsApp (رقم أو رابط)"
            value={form.whatsapp ?? ""}
            onChange={(v) => up("whatsapp", v)}
          />
          <Input
            label="Instagram handle (without @)"
            value={form.instagram ?? ""}
            onChange={(v) => up("instagram", v)}
          />
          <Input label="Website" value={form.website ?? ""} onChange={(v) => up("website", v)} />
          {/* Shared kitchen (orange dot) now lives with the safety level options above. */}

          {!form.no_location && (
            <>
              <Input
                label="العنوان / Address"
                value={form.address ?? ""}
                onChange={(v) => up("address", v)}
                className="sm:col-span-2"
              />
              {/* Coordinates are set by the map picker below, never typed by hand. */}

              <Input
                label="Directions link (paste from Directions)"
                value={form.maps_url ?? ""}
                onChange={(v) => up("maps_url", v)}
                className="sm:col-span-2"
              />
              <LocationPicker
                lat={form.lat}
                lng={form.lng}
                onPick={(lat, lng) => setForm((f: any) => ({ ...f, lat, lng }))}
              />
            </>
          )}
        </Grid>
      </Section>

      {!isNew && (
        <Section title="الفروع / Branches">
          <BranchEditor
            businessId={id}
            city={form.city}
            existing={branches}
            plan={selectedPlan}
            onSave={async (row) => {
              await saveBranch({ data: row });
              await qc.invalidateQueries({ queryKey: ["admin-business", id] });
              await qc.invalidateQueries({ queryKey: ["businesses"] });
            }}
            onDelete={async (branchId) => {
              await removeBranch({ data: { id: branchId } });
              await qc.invalidateQueries({ queryKey: ["admin-business", id] });
              await qc.invalidateQueries({ queryKey: ["businesses"] });
            }}
          />
        </Section>
      )}

      {/* Online-only businesses have no storefront, so opening hours are hidden. */}
      {!form.no_location && (
        <Section title="Opening hours">
          <Grid>
            {DAYS.map(([k, label]) => (
              <Input
                key={k}
                label={label}
                value={form.hours[k] ?? ""}
                onChange={(v) => up("hours", { ...form.hours, [k]: v })}
              />
            ))}
          </Grid>
        </Section>
      )}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-2">
        <span
          className={`me-auto rounded-full px-3 py-1 text-xs font-medium ${form.published ? "bg-primary/10 text-primary" : "bg-amber-500/15 text-amber-700"}`}
        >
          {form.published ? "الحالة: منشور للزوار" : "الحالة: مخفي — بانتظار الموافقة"}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            if (
              !form.published ||
              window.confirm("سيتم إخفاء هذا المشروع عن الموقع وحفظه كمسودة. متأكد؟")
            )
              void submit(false);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium shadow-[var(--shadow-soft)] disabled:opacity-70"
        >
          <FileText className="h-4 w-4" /> حفظ في الأدمن فقط
        </button>
        <button
          type="button"
          onClick={() => void submit(true)}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-elevated)] disabled:opacity-70"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {form.published ? "حفظ التعديلات المنشورة" : "موافقة ونشر للزوار"}
        </button>
      </div>
    </div>
  );
}

/**
 * Branches are discovered from Directions instead of typed in by hand.
 * The admin previews every location found, removes the wrong ones with ✕,
 * and only then imports the rest (opening hours included).
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
  step,
  className = "",
  inline,
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
  className?: string;
  inline?: boolean;
}) {
  return (
    <label className={`flex ${inline ? "items-center gap-2" : "flex-col gap-1"} ${className}`}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        required={required}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 sm:col-span-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Live performance of this business — impressions, views and each click type. */
function BusinessPerformance({
  businessId,
  name,
  plan,
}: {
  businessId: string;
  name: string;
  plan: PlanTier;
}) {
  const fetchReport = useServerFn(getBusinessReport);
  const [range, setRange] = useState<RangeKey>("30d");
  const [exporting, setExporting] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-business-report", businessId, range],
    queryFn: () => fetchReport({ data: { businessId, range } }),
  });

  const report = data?.report ?? null;
  const previous = data?.previous ?? null;
  const cells: [string, keyof NonNullable<typeof report>][] = [
    ["الظهور في النتائج / Impressions", "impressions"],
    ["مشاهدات الصفحة / Page views", "views"],
    ["الاتجاهات / Directions", "maps"],
    ["التوصيل / Delivery", "delivery"],
    ["الحجز / Booking", "booking"],
    ["واتساب / WhatsApp", "whatsapp"],
    ["الموقع الإلكتروني / Website", "website"],
    ["الاتصال / Calls", "phone"],
    ["نقرات التواصل / Contact clicks", "contactClicks"],
    ["الإضافات للمفضلة / Favorite adds", "favorites"],
  ];

  return (
    <Section title="أداء المنشأة / Performance">
      <div className="mb-3 flex items-center gap-2">
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs"
        >
          {RANGES.map((r) => (
            <option key={r} value={r}>
              {RANGE_LABELS[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!report || exporting}
          onClick={async () => {
            if (!report) return;
            setExporting(true);
            try {
              await downloadBusinessReportPdf(
                {
                  name,
                  plan,
                  views: report.views,
                  contactClicks: report.contactClicks,
                  favorites: report.favorites,
                },
                range,
              );
            } catch (pdfError) {
              alert(`تعذّر إنشاء ملف PDF: ${(pdfError as Error).message}`);
            } finally {
              setExporting(false);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          PDF للفترة المختارة
        </button>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {data?.level === "none" ? (
        <p className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          التقارير غير مفعّلة في الباقة المجانية — ارفع الباقة إلى Pro أو Premium لعرض الأرقام.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {report &&
              cells.map(([label, key]) => {
                const value = (report[key] as number) ?? 0;
                const prev = previous ? ((previous[key] as number | undefined) ?? 0) : null;
                const delta = prev === null ? null : value - prev;
                return (
                  <div key={label} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="mt-1 font-display text-xl font-semibold">{value}</p>
                    {delta !== null && (
                      <p
                        className={`mt-0.5 text-[11px] ${delta >= 0 ? "text-primary" : "text-destructive"}`}
                      >
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} مقارنة بالفترة السابقة ({prev})
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          {data?.level === "full" && (
            <p className="mt-3 text-xs text-muted-foreground">
              باقة Premium: المقارنة مع الفترة السابقة مفعّلة. التقرير الدوري التلقائي بالبريد لم
              يُفعَّل بعد.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
