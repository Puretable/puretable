import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { cancelPlanRequest, requestPlan } from "@/lib/owner-portal.functions";
import {
  friendlyPortalError,
  planMove,
  type OwnerBusiness,
  type PlanPeriod,
} from "@/lib/owner-portal";
import { PLAN_LABELS, PLAN_SUMMARIES, PLAN_TIERS, type PlanTier } from "@/lib/plans";
import { planSummary, toFeatures, type PlanCatalog } from "@/lib/subscriptions";

export function PlanPicker({
  business,
  catalog,
}: {
  business: OwnerBusiness;
  catalog: PlanCatalog | undefined;
}) {
  const qc = useQueryClient();
  const request = useServerFn(requestPlan);
  const cancel = useServerFn(cancelPlanRequest);
  const [period, setPeriod] = useState<PlanPeriod>(1);
  const [busy, setBusy] = useState<PlanTier | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = business.pending;

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["owner-overview"] }),
      qc.invalidateQueries({ queryKey: ["owner-history", business.id] }),
      qc.invalidateQueries({ queryKey: ["owner-report", business.id] }),
    ]);
  }

  async function choose(plan: PlanTier) {
    if (busy) return;
    if (plan === "free") {
      const freeLimit = catalog?.free.branch_limit ?? 1;
      const hidden = Math.max(0, business.usage.branches_published - (freeLimit ?? 0));
      const warning = hidden
        ? `سيتم الانتقال إلى Free فوراً وإخفاء ${hidden} فرع زائد (دون حذفها)، وستقل الصور والروابط الظاهرة للزوار. هل تريد المتابعة؟`
        : "سيتم الانتقال إلى Free فوراً وستقل بعض المميزات. هل تريد المتابعة؟";
      if (!window.confirm(warning)) return;
    }
    setBusy(plan);
    setError("");
    setMessage("");
    try {
      await request({ data: { businessId: business.id, plan, periodMonths: period } });
      setMessage(
        plan === "free"
          ? "تم الانتقال إلى الباقة المجانية."
          : "تم إرسال طلبك. ستراجعه الإدارة وتفعّل الباقة، وسنعرض حالتها هنا.",
      );
      await refresh();
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancelRequest() {
    if (busy) return;
    setBusy("cancel");
    setError("");
    setMessage("");
    try {
      await cancel({ data: { businessId: business.id } });
      setMessage("تم إلغاء الطلب.");
      await refresh();
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">اختر باقتك</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الدفع الإلكتروني غير مفعّل حالياً. طلب Pro أو Premium يصل إلى الإدارة لتفعيله، أما
          الانتقال إلى Free فيتم فوراً.
        </p>
      </div>
      {pending && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm"
        >
          <span className="flex-1">
            لديك طلب مفتوح للباقة <strong>{PLAN_LABELS[pending.plan]}</strong> بانتظار تفعيل
            الإدارة.
          </span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void cancelRequest()}
            className="min-h-11 rounded-full border bg-background px-4 text-sm disabled:opacity-60"
          >
            {busy === "cancel" ? "جارٍ الإلغاء…" : "إلغاء الطلب"}
          </button>
        </div>
      )}
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-1 text-xs text-muted-foreground">
          مدة الاشتراك للباقات المدفوعة
        </legend>
        {(
          [
            [1, "شهر"],
            [12, "سنة"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="inline-flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="period"
              checked={period === value}
              onChange={() => setPeriod(value)}
              className="accent-[hsl(var(--primary))]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_TIERS.map((tier) => {
          const move = planMove(business.plan, tier);
          const isPendingTier = pending?.plan === tier;
          return (
            <article
              key={tier}
              className={`flex flex-col rounded-2xl border p-5 ${move === "current" ? "border-primary bg-primary-soft" : "bg-card"}`}
            >
              <h3 className="font-semibold">{PLAN_LABELS[tier]}</h3>
              <p className="mt-2 flex-1 text-xs leading-6 text-muted-foreground">
                {catalog ? planSummary(toFeatures(catalog[tier])) : PLAN_SUMMARIES[tier]}
              </p>
              {move === "current" ? (
                <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  <Check className="h-4 w-4" /> باقتك الحالية
                </p>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null || isPendingTier}
                  onClick={() => void choose(tier)}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {busy === tier && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isPendingTier
                    ? "الطلب قيد المراجعة"
                    : tier === "free"
                      ? "الانتقال إلى Free"
                      : move === "upgrade"
                        ? "طلب الترقية"
                        : "طلب الانتقال"}
                </button>
              )}
            </article>
          );
        })}
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
    </section>
  );
}
