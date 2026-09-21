import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SubscriptionHistory } from "@/components/portal/SubscriptionHistory";
import {
  adminAddOwner,
  adminListOwners,
  adminListSubscriptionHistory,
  adminReactivateAccess,
  adminRemoveOwner,
  adminSuspendAccess,
} from "@/lib/owner-admin.functions";
import { STATUS_LABELS, emailSchema, formatDate, friendlyPortalError } from "@/lib/owner-portal";

/** Admin: who may sign in to the Owner Portal for this business, plus its subscription history. */
export function BusinessOwnersPanel({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(adminListOwners);
  const add = useServerFn(adminAddOwner);
  const remove = useServerFn(adminRemoveOwner);
  const listHistory = useServerFn(adminListSubscriptionHistory);
  const suspend = useServerFn(adminSuspendAccess);
  const reactivate = useServerFn(adminReactivateAccess);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owners = useQuery({
    queryKey: ["admin-business-owners", businessId],
    queryFn: () => list({ data: { businessId } }),
  });
  const history = useQuery({
    queryKey: ["admin-business-subscriptions", businessId],
    queryFn: () => listHistory({ data: { businessId } }),
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError("أدخل بريداً إلكترونياً صحيحاً.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await add({ data: { businessId, email: parsed.data } });
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["admin-business-owners", businessId] });
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  const current = history.data?.find(
    (row) => row.status === "active" || row.status === "suspended",
  );

  async function toggleAccess() {
    if (busy || !current) return;
    const suspending = current.status === "active";
    let reason: string | null = null;
    if (suspending) {
      reason = window.prompt(
        "تعليق وصول هذا العمل وباقته؟ ستتوقف مزايا الباقة المدفوعة ويصبح المالك للقراءة فقط.\nسبب التعليق (اختياري، يظهر للمالك):",
      );
      if (reason === null) return;
    } else if (
      !window.confirm("إعادة تفعيل الوصول والباقة؟ سيمتد تاريخ الانتهاء بمقدار مدة التعليق.")
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (suspending) await suspend({ data: { businessId, reason: reason?.trim() || null } });
      else await reactivate({ data: { businessId } });
      await Promise.all(
        [
          ["admin-business-subscriptions", businessId],
          ["admin-business", businessId],
          ["admin-businesses"],
          ["admin-pending-requests"],
          ["business"],
        ].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  async function detach(id: string, ownerEmail: string) {
    if (busy) return;
    if (!window.confirm(`إزالة ${ownerEmail}؟ سيفقد الوصول إلى بوابة هذا العمل فوراً.`)) return;
    setBusy(true);
    setError("");
    try {
      await remove({ data: { id } });
      await qc.invalidateQueries({ queryKey: ["admin-business-owners", businessId] });
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        أصحاب العمل وسجل الاشتراكات / Owners &amp; subscription history
      </h2>
      <div className="mt-4 space-y-6">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            البريد المضاف هنا يستطيع الدخول إلى بوابة أصحاب الأعمال (/portal) برمز تحقق، ولا يرى إلا
            هذا العمل.
          </p>
          {owners.isLoading ? (
            <p role="status" className="text-sm">
              جارٍ التحميل…
            </p>
          ) : owners.isError ? (
            <p role="alert" className="text-sm text-destructive">
              تعذر تحميل الملاك.
            </p>
          ) : owners.data?.length ? (
            <ul className="divide-y rounded-xl border">
              {owners.data.map((owner) => (
                <li key={owner.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <span dir="ltr" className="break-all">
                      {owner.email}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      أضيف في {formatDate(owner.created_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void detach(owner.id, owner.email)}
                    className="rounded-lg border px-3 py-1.5 text-xs text-destructive disabled:opacity-60"
                  >
                    إزالة
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">لا يوجد مالك مرتبط بهذا العمل بعد.</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-56 flex-1 gap-1 text-xs">
              بريد المالك
              <input
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit(e);
                }}
                className="rounded-lg border bg-background p-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || !email}
              onClick={(e) => void submit(e)}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              إضافة مالك
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        {current && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${current.status === "suspended" ? "border-destructive/40 bg-destructive/5" : ""}`}
          >
            <span>
              حالة الاشتراك والوصول: <strong>{STATUS_LABELS[current.status]}</strong>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleAccess()}
              className={`rounded-lg px-4 py-2 text-xs disabled:opacity-60 ${current.status === "suspended" ? "bg-primary text-primary-foreground" : "border text-destructive"}`}
            >
              {current.status === "suspended" ? "إعادة تفعيل الوصول" : "تعليق الوصول والاشتراك"}
            </button>
          </div>
        )}
        <div className="space-y-2">
          <h3 className="text-sm font-medium">سجل الاشتراكات</h3>
          <SubscriptionHistory
            rows={history.data}
            loading={history.isLoading}
            error={history.isError}
          />
        </div>
      </div>
    </section>
  );
}
