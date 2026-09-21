import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { usePlanDefinitions } from "@/hooks/use-plan-definitions";
import { adminListBusinesses } from "@/lib/businesses.functions";
import { updatePlanDefinition } from "@/lib/subscriptions.functions";
import { PlanDefinition, toFeatures, planSummary } from "@/lib/subscriptions";
import { PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/lib/plans";
import { BusinessPlanControl } from "@/components/admin/BusinessPlanControl";
import { PendingPlanRequests } from "@/components/admin/PendingPlanRequests";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const [tab, setTab] = useState<"businesses" | "definitions">("businesses");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");
  const { data: catalog, isLoading, error } = usePlanDefinitions();
  const list = useServerFn(adminListBusinesses);
  const businesses = useQuery({ queryKey: ["admin-businesses"], queryFn: () => list() });
  const all = businesses.data ?? [];
  const counts = (tier: PlanTier) => all.filter((business) => business.plan === tier).length;
  const rows = all.filter(
    (business) =>
      (!filter || business.plan === filter) &&
      [business.name, business.name_ar, business.city].some((value) =>
        value?.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()),
      ),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">الاشتراكات والباقات</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          إدارة يدوية بالكامل، بدون دفع أو تجديد تلقائي. كل عمل يتبع تعريف باقته المشترك.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PLAN_TIERS.map((tier) => (
          <div key={tier} className="rounded-xl border bg-card p-4">
            <p className="font-semibold">{PLAN_LABELS[tier]}</p>
            <p className="mt-1 text-2xl">
              {businesses.isLoading ? "…" : counts(tier)}{" "}
              <span className="text-xs text-muted-foreground">أعمال</span>
            </p>
          </div>
        ))}
      </div>
      <PendingPlanRequests />
      <div role="tablist" aria-label="إدارة الاشتراكات" className="flex gap-2">
        {(
          [
            ["businesses", "اشتراكات الأعمال"],
            ["definitions", "تعريف الباقات"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "businesses"
                    : event.key === "End"
                      ? "definitions"
                      : tab === "businesses"
                        ? "definitions"
                        : "businesses";
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            aria-controls={`panel-${value}`}
            id={`tab-${value}`}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-lg border px-4 py-2 text-sm ${tab === value ? "bg-primary text-primary-foreground" : "bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {(error || businesses.error) && (
        <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">
          تعذر تحميل البيانات.{" "}
          <button type="button" onClick={() => window.location.reload()}>
            إعادة المحاولة
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
          {notice}
        </p>
      )}
      {isLoading && <p role="status">جارٍ تحميل تعريفات الباقات…</p>}
      {tab === "businesses" ? (
        <section
          role="tabpanel"
          id="panel-businesses"
          aria-labelledby="tab-businesses"
          className="space-y-4"
        >
          <div className="flex flex-wrap gap-3">
            <label className="grid flex-1 gap-1 text-xs">
              ابحث عن عمل
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="الاسم أو المدينة"
                className="rounded-lg border bg-background p-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-xs">
              تصفية حسب الباقة
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="rounded-lg border bg-background p-3 text-sm"
              >
                <option value="">كل الباقات</option>
                {PLAN_TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {PLAN_LABELS[tier]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {businesses.isLoading ? (
            <p role="status">جارٍ تحميل الأعمال…</p>
          ) : rows.length === 0 ? (
            <p>لا توجد أعمال مطابقة.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((business) => (
                <article key={business.id} className="space-y-4 rounded-xl border bg-card p-5">
                  <div className="flex justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{business.name_ar || business.name}</h2>
                      <p className="text-xs text-muted-foreground">{business.city}</p>
                    </div>
                    <Link
                      to="/admin/businesses/$id"
                      params={{ id: business.id }}
                      className="text-xs text-primary underline"
                    >
                      فتح العمل
                    </Link>
                  </div>
                  <BusinessPlanControl
                    businessId={business.id}
                    name={business.name}
                    currentPlan={business.plan}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section
          role="tabpanel"
          id="panel-definitions"
          aria-labelledby="tab-definitions"
          className="space-y-4"
        >
          <p className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm">
            تعديل تعريف الباقة يطبق على جميع الأعمال التابعة لها. يُعرض أثر حدود الفروع قبل التأكيد،
            ولا تُحذف صور أو فروع عند خفض الباقة.
          </p>
          {catalog && (
            <div className="grid items-start gap-4 md:grid-cols-3">
              {PLAN_TIERS.map((tier) => (
                <DefinitionEditor
                  key={tier + catalog[tier].revision}
                  definition={catalog[tier]}
                  count={counts(tier)}
                  onSaved={() =>
                    setNotice(`تم حفظ تعريف ${PLAN_LABELS[tier]} وتطبيقه على الأعمال التابعة له.`)
                  }
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            ترتيب البحث يبقى Premium ثم Pro ثم Free للنتائج المطابقة. هذه الصفحة تدير المميزات
            المدعومة حالياً فقط؛ لا تشمل الدفع أو إرسال تقارير تلقائية.
          </p>
        </section>
      )}
    </div>
  );
}

function DefinitionEditor({
  definition,
  count,
  onSaved,
}: {
  definition: PlanDefinition;
  count: number;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(definition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const update = useServerFn(updatePlanDefinition);
  const qc = useQueryClient();
  const dirty = JSON.stringify(draft) !== JSON.stringify(definition);
  async function save() {
    const valid = PlanDefinition.safeParse(draft);
    if (!valid.success) {
      setError(
        "راجع الحدود الرقمية. الصور من 1 إلى 100، والفروع من 1 إلى 1000 أو غير محدودة، والوصف من 20 إلى 10000 أو غير محدود.",
      );
      return;
    }
    if (
      !window.confirm(
        `سيطبق تعريف ${PLAN_LABELS[draft.id]} على ${count} أعمال. حد الفروع الجديد: ${draft.branch_limit ?? "غير محدود"}. سيتم إخفاء الزائد دون حذفه. هل تريد الحفظ؟`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await update({ data: draft });
      setDraft(result);
      setSaved(true);
      onSaved();
      qc.setQueryData(["plan-definitions"], (old: Record<string, PlanDefinition> | undefined) =>
        old ? { ...old, [result.id]: result } : old,
      );
      await Promise.all(
        [
          ["admin-businesses"],
          ["admin-business"],
          ["businesses"],
          ["business"],
          ["dashboard"],
          ["admin-business-report"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy} className="space-y-4 rounded-xl border bg-card p-5">
      <legend className="px-2 font-semibold">{PLAN_LABELS[draft.id]}</legend>
      <p className="text-xs text-muted-foreground">
        {count} أعمال · إصدار {definition.revision}
      </p>
      {(["branch_limit", "photo_limit", "description_limit"] as const).map((key) => (
        <label key={key} className="grid gap-2 text-sm">
          {
            {
              branch_limit: "حد الفروع المنشورة",
              photo_limit: "عدد الصور مع الغلاف",
              description_limit: "حد حروف الوصف",
            }[key]
          }
          <input
            type="number"
            min={key === "description_limit" ? 20 : 1}
            max={key === "branch_limit" ? 1000 : key === "photo_limit" ? 100 : 10000}
            value={draft[key] ?? ""}
            placeholder={key === "photo_limit" ? "مطلوب" : "فارغ = غير محدود"}
            onChange={(e) =>
              setDraft({
                ...draft,
                [key]:
                  e.target.value === "" && key !== "photo_limit" ? null : Number(e.target.value),
              })
            }
            className="rounded-lg border bg-background p-2"
          />
          {key !== "photo_limit" && (
            <span className="text-xs text-muted-foreground">اتركه فارغاً لعدد غير محدود.</span>
          )}
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.show_links}
          onChange={(e) => setDraft({ ...draft, show_links: e.target.checked })}
        />
        إظهار الروابط الإضافية: الموقع وواتساب والطلب والحجز
      </label>
      <label className="grid gap-2 text-sm">
        مستوى تحليلات العمل
        <select
          value={draft.analytics}
          onChange={(e) =>
            setDraft({ ...draft, analytics: e.target.value as PlanDefinition["analytics"] })
          }
          className="rounded-lg border bg-background p-2"
        >
          <option value="none">غير متاحة</option>
          <option value="basic">أساسية</option>
          <option value="full">كاملة مع مقارنة الفترة السابقة</option>
        </select>
      </label>
      <p className="text-xs leading-6 text-muted-foreground">{planSummary(toFeatures(draft))}</p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-xs text-primary">
          تم حفظ التعريف وتطبيقه.
        </p>
      )}
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={() => void save()}
        className="w-full rounded-lg bg-primary p-3 text-sm text-primary-foreground disabled:opacity-50"
      >
        {busy ? "جارٍ التطبيق…" : "حفظ تعريف الباقة"}
      </button>
    </fieldset>
  );
}
