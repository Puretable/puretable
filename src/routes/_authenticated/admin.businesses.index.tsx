import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  adminListBusinesses,
  deleteBusiness,
  upsertBusiness,
  dedupeBusinesses,
  setBusinessPlan,
  setBusinessPublication,
} from "@/lib/businesses.functions";
import { signCoverUploadUrl } from "@/lib/admin.functions";
import { adminListPlaceCategories } from "@/lib/category.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Upload,
  Loader2,
  X,
  Search,
  AlertTriangle,
  Copy,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/admin/businesses/")({
  component: BusinessesList,
});

const CATEGORY_ORDER: Record<string, number> = {
  bakery: 0,
  restaurant: 1,
  dessert: 2,
  cafe: 3,
  fine_dining: 4,
  delivery: 5,
  home: 6,
  supermarket: 7,
};

type SortKey = "name" | "category" | "city" | "status" | "links" | "updated";

function BusinessesList() {
  const navigate = useNavigate({ from: Route.fullPath });
  const list = useServerFn(adminListBusinesses);
  const del = useServerFn(deleteBusiness);
  const save = useServerFn(upsertBusiness);
  const changePlan = useServerFn(setBusinessPlan);
  const changePublication = useServerFn(setBusinessPublication);
  const [publicationFilter, setPublicationFilter] = useState("all");
  const [publicationBusy, setPublicationBusy] = useState<string | null>(null);
  const [publicationMessage, setPublicationMessage] = useState("");
  const dedupe = useServerFn(dedupeBusinesses);
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-businesses"],
    queryFn: () => list(),
  });
  const [imageFor, setImageFor] = useState<any | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("category");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  function toggleSort(key: SortKey) {
    setSortBy((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }
  const [search, setSearch] = useState("");
  const [onlyReview, setOnlyReview] = useState(false);
  const [dedupeMsg, setDedupeMsg] = useState<string | null>(null);
  const [dedupeBusy, setDedupeBusy] = useState(false);
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const loadCategories = useServerFn(adminListPlaceCategories);
  const { data: categoryCatalog = [] } = useQuery({
    queryKey: ["admin-place-categories"],
    queryFn: () => loadCategories(),
  });
  const filterOptions: [string, string][] = categoryCatalog
    .filter((category) => category.level === "sub")
    .map((category) => [category.value, `${category.name_ar} / ${category.name_en}`]);

  const needle = search.trim().toLowerCase();
  const rows = (data as any[])
    .filter(
      (b) =>
        publicationFilter === "all" ||
        (publicationFilter === "published" ? b.published : !b.published),
    )
    .filter((b) => (onlyReview ? b.needs_review : true))
    .filter((b) =>
      !categoryFilter
        ? true
        : b.category === categoryFilter || (b.categories ?? []).includes(categoryFilter),
    )
    .filter((b) =>
      !needle
        ? true
        : [b.name, b.name_ar, b.slug, b.city, b.city_ar, b.category]
            .filter(Boolean)
            .some((v: string) => v.toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const byName = (a.name ?? "").localeCompare(b.name ?? "");
      switch (sortBy) {
        case "city":
          return dir * ((a.city ?? "").localeCompare(b.city ?? "") || byName);
        case "name":
          return dir * byName;
        case "status":
          return dir * (Number(!!b.published) - Number(!!a.published) || byName);
        case "links":
          return (
            dir * ((a.business_links?.length ?? 0) - (b.business_links?.length ?? 0) || byName)
          );
        case "updated":
          return (
            dir * (new Date(a.updated_at ?? 0).getTime() - new Date(b.updated_at ?? 0).getTime())
          );
        default:
          return (
            dir *
            ((CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) || byName)
          );
      }
    });

  const reviewCount = (data as any[]).filter((b) => b.needs_review).length;

  // Stats — totals per category and per city.
  const all = data as any[];
  const byCategory = filterOptions.map(([value, label]) => ({
    value,
    label,
    count: all.filter((b) => b.category === value || (b.categories ?? []).includes(value)).length,
  }));
  const cityCounts = Object.entries(
    all.reduce<Record<string, number>>((acc, b) => {
      const key = (b.city_ar || b.city || "—").trim();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-businesses"] });
    qc.invalidateQueries({ queryKey: ["businesses"] });
    qc.invalidateQueries({ queryKey: ["business"] });
    qc.invalidateQueries({ queryKey: ["admin-business"] });
  }

  async function runDedupe(silent = false) {
    if (
      !window.confirm(
        "سيتم حذف السجلات التي يعتبرها النظام مكررة. يفضل مراجعة البيانات ونسخها احتياطياً أولاً. هل تريد المتابعة؟",
      )
    )
      return;
    setDedupeBusy(true);
    try {
      const r: any = await dedupe();
      if (r.count > 0) {
        setDedupeMsg(
          `Removed ${r.count} duplicate${r.count > 1 ? "s" : ""}: ${r.removed.join(", ")}`,
        );
        refresh();
      } else if (!silent) {
        setDedupeMsg("No duplicates found.");
      }
    } catch (e: any) {
      if (!silent) setDedupeMsg(e?.message ?? "Could not check for duplicates");
    } finally {
      setDedupeBusy(false);
    }
  }

  async function patch(b: any, changes: Record<string, unknown>) {
    const { business_links, business_branches, created_at, updated_at, ...rest } = b;
    await save({ data: { ...rest, ...changes } });
    refresh();
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await del({ data: { id } });
      qc.invalidateQueries({ queryKey: ["admin-businesses"] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
    } catch (e: any) {
      // A failed delete used to fail silently (unhandled rejection, no UI feedback at all) —
      // this is what made past failures look like "nothing happens".
      alert(`تعذر الحذف: ${e?.message ?? "خطأ غير معروف"}`);
    }
  }

  async function togglePublish(b: any) {
    if (
      !window.confirm(
        b.published
          ? `إخفاء «${b.name}» عن الزوار؟ ستبقى بياناته في الأدمن.`
          : `هل حصلت على موافقة «${b.name}»؟ سيظهر للزوار في قسمه والبحث.`,
      )
    )
      return;
    setPublicationBusy(b.id);
    setPublicationMessage("");
    try {
      await changePublication({ data: { id: b.id, published: !b.published } });
      setPublicationMessage(
        b.published ? "تم إخفاء المحل مع الاحتفاظ ببياناته." : "تم نشر المحل للزوار في قسمه.",
      );
      refresh();
    } catch (error) {
      setPublicationMessage(error instanceof Error ? error.message : "تعذر تغيير حالة النشر.");
    } finally {
      setPublicationBusy(null);
    }
  }

  async function onPlanChange(b: any, plan: PlanTier) {
    setPlanBusyId(b.id);
    setPlanMessage(null);
    try {
      const result = await changePlan({ data: { id: b.id, plan } });
      const effect = result.branchStatus;
      const detail = effect.newlyHidden
        ? ` أُخفي ${effect.newlyHidden} فرع تلقائياً دون حذفه.`
        : effect.restored
          ? ` أُعيد إظهار ${effect.restored} فرع كان مخفياً بسبب الباقة.`
          : " لم يتغير ظهور الفروع.";
      setPlanMessage(`تم تطبيق ${PLAN_LABELS[plan]} على ${b.name}.${detail}`);
      refresh();
    } catch (error) {
      setPlanMessage(error instanceof Error ? error.message : "تعذر تغيير الباقة");
    } finally {
      setPlanBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">الأعمال والفروع</h1>
          <p className="text-sm text-muted-foreground">
            كل المحلات محفوظة هنا. بعد التواصل والحصول على الموافقة اضغط «موافقة ونشر» ليظهر المحل
            للزوار في قسمه.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/businesses/$id"
            params={{ id: "new" }}
            onClick={(event) => {
              event.preventDefault();
              void navigate({ to: "/admin/businesses/$id", params: { id: "new" } });
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> إضافة عمل
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="حالة النشر">
        {[
          ["all", "كل المحلات", data.length],
          ["pending", "بانتظار الموافقة / مخفي", data.filter((b) => !b.published).length],
          ["published", "منشور للزوار", data.filter((b) => b.published).length],
        ].map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={publicationFilter === value}
            onClick={() => setPublicationFilter(String(value))}
            className={`rounded-full border px-4 py-2 text-sm ${publicationFilter === value ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {label} ({count})
          </button>
        ))}
      </div>
      {publicationMessage && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          {publicationMessage}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">حسب القسم</h2>
            <span className="font-display text-2xl font-semibold">{all.length}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {byCategory.map((c) => {
              const active = categoryFilter === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategoryFilter(active ? null : c.value)}
                  className={`rounded-xl px-3 py-2 text-start transition ${active ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"}`}
                >
                  <div className="text-lg font-semibold leading-tight">{c.count}</div>
                  <div
                    className={`text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    {c.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">By city</h2>
            <span className="text-xs text-muted-foreground">{cityCounts.length} cities</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {cityCounts.length === 0 && (
              <span className="text-xs text-muted-foreground">No data yet</span>
            )}
            {cityCounts.map(([city, count]) => (
              <span
                key={city}
                className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs"
              >
                {city} <b className="text-primary">{count}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      {dedupeMsg && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-2 text-xs">
          <span>{dedupeMsg}</span>
          <button
            onClick={() => setDedupeMsg(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {planMessage && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary">
          <span>{planMessage}</span>
          <button type="button" onClick={() => setPlanMessage(null)} aria-label="إغلاق الرسالة">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو المدينة أو التصنيف…"
            className="w-full rounded-full border border-border bg-background ps-9 pe-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyReview((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs ${
            onlyReview
              ? "border-amber-500 bg-amber-500/10 text-amber-700"
              : "border-border hover:border-primary/40"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Needs review ({reviewCount})
        </button>
        <button
          type="button"
          onClick={() => runDedupe(false)}
          disabled={dedupeBusy}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs hover:border-primary/40 disabled:opacity-60"
        >
          {dedupeBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}{" "}
          حذف المكررات
        </button>
        {categoryFilter && (
          <button
            type="button"
            onClick={() => setCategoryFilter(null)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-2 text-xs text-primary"
          >
            {filterOptions.find(([v]) => v === categoryFilter)?.[1] ?? categoryFilter}
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-xs text-muted-foreground">{rows.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {data.length === 0
              ? "No businesses yet. Add your first one."
              : "No businesses match your search."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">Image</th>
                {(
                  [
                    ["name", "Name"],
                    ["category", "Category"],
                    ["city", "City"],
                    ["status", "Status"],
                    ["links", "Links"],
                    ["updated", "Last updated"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="px-4 py-3 text-start">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                    >
                      {label}
                      {sortBy === key &&
                        (sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        ))}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-start">Plan</th>
                <th className="px-4 py-3 text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b: any) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setImageFor(b)}
                      className="group relative block h-12 w-12 overflow-hidden rounded-lg border border-border bg-background"
                      title={
                        b.cover_url
                          ? "استبدال أو حذف الصورة / Replace or remove image"
                          : "إضافة صورة / Add image"
                      }
                    >
                      {b.cover_url ? (
                        <img
                          src={b.cover_url}
                          alt=""
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      <button
                        type="button"
                        onClick={() => patch(b, { dedicated_gf: !b.dedicated_gf })}
                        title={
                          b.dedicated_gf
                            ? "100% dedicated gluten-free (green)"
                            : "Gluten-free options — confirm with staff (red)"
                        }
                        className={`h-3 w-3 shrink-0 rounded-full ${b.dedicated_gf ? "bg-safety-safe" : "bg-safety-caution"}`}
                      />
                      {b.name}
                      {b.verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <div className="text-xs text-muted-foreground">/{b.slug}</div>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={b.category}
                      onChange={(e) =>
                        patch(b, {
                          category: e.target.value,
                          categories: [
                            ...new Set([
                              e.target.value,
                              ...(b.categories ?? []).filter(
                                (value: string) => value !== b.category,
                              ),
                            ]),
                          ],
                        })
                      }
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs capitalize"
                    >
                      {filterOptions.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">{b.city}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${b.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                      >
                        {b.published ? "منشور للزوار" : "بانتظار الموافقة / مخفي"}
                      </span>
                      {b.needs_review && (
                        <button
                          type="button"
                          onClick={() => patch(b, { needs_review: false, review_notes: [] })}
                          title={
                            (b.review_notes ?? []).join(", ") ||
                            "Some details could not be found automatically"
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700"
                        >
                          <AlertTriangle className="h-3 w-3" /> Needs review
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{b.business_links?.length ?? 0}</td>
                  <td
                    className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {b.updated_at ? new Date(b.updated_at).toLocaleString() : "—"}
                  </td>
                  {/* Plan is manual only — changing it here never triggers any billing. */}
                  <td className="px-4 py-3">
                    <select
                      value={(b as any).plan ?? "free"}
                      disabled={planBusyId === b.id}
                      onChange={(e) => void onPlanChange(b, e.target.value as PlanTier)}
                      aria-label={`باقة ${b.name}`}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs capitalize disabled:opacity-50"
                    >
                      {PLAN_TIERS.map((plan) => (
                        <option key={plan} value={plan}>
                          {PLAN_LABELS[plan]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={publicationBusy !== null}
                        onClick={() => void togglePublish(b)}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:border-primary/40 hover:text-primary"
                      >
                        {publicationBusy === b.id ? (
                          "جارٍ الحفظ…"
                        ) : b.published ? (
                          <>
                            <EyeOff className="h-3 w-3" /> إخفاء عن الزوار
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3" /> موافقة ونشر
                          </>
                        )}
                      </button>
                      <Link
                        to="/admin/businesses/$id"
                        params={{ id: b.id }}
                        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs hover:border-primary/40 hover:text-primary"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </Link>
                      <button
                        onClick={() => onDelete(b.id, b.name)}
                        className="inline-flex items-center gap-1 rounded-full border border-destructive/30 px-3 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {imageFor && (
        <ImageDialog
          business={imageFor}
          onClose={() => setImageFor(null)}
          onSave={async (coverUrl) => {
            await patch(imageFor, { cover_url: coverUrl });
            setImageFor(null);
          }}
        />
      )}
    </div>
  );
}

/** Per-business image control: keep, replace, paste a URL, or clear it. */
function ImageDialog({
  business,
  onClose,
  onSave,
}: {
  business: any;
  onClose: () => void;
  onSave: (coverUrl: string | null) => Promise<void>;
}) {
  const signUpload = useServerFn(signCoverUploadUrl);
  const [url, setUrl] = useState<string>(business.cover_url ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const { token, path, readUrl } = await signUpload({ data: { filename: file.name } });
      const { error } = await supabase.storage
        .from("business-covers")
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (error) throw error;
      setUrl(readUrl);
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {business.cover_url ? "الصورة / Image" : "إضافة صورة / Add image"}
            </h2>
            <p className="text-xs text-muted-foreground">{business.name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-contain p-3" />
          ) : (
            <span className="text-xs text-muted-foreground">
              No image yet — upload the official logo
            </span>
          )}
        </div>

        {err && <p className="text-xs text-destructive">{err}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:border-primary/40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}{" "}
            {url ? "استبدال الصورة / Replace image" : "إضافة صورة / Add image"}
          </button>
          {url && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="rounded-full border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              حذف الصورة / Remove image
            </button>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">or paste an image URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-4 py-1.5 text-xs"
          >
            Keep current
          </button>
          <button
            disabled={busy}
            onClick={() => onSave(url.trim() || null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-70"
          >
            Save image
          </button>
        </div>
      </div>
    </div>
  );
}
