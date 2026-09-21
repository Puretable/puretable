import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminActivateSubscription,
  adminListPendingRequests,
  adminRejectSubscription,
  type AdminPendingRequest,
} from "@/lib/owner-admin.functions";
import { formatDate, friendlyPortalError } from "@/lib/owner-portal";
import { PLAN_LABELS } from "@/lib/plans";

/** Plan requests sent from the Owner Portal. Renders nothing while there are none. */
export function PendingPlanRequests() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPendingRequests);
  const requests = useQuery({ queryKey: ["admin-pending-requests"], queryFn: () => list() });
  if (!requests.data?.length && !requests.isError) return null;
  return (
    <section
      aria-labelledby="pending-requests"
      className="space-y-3 rounded-xl border border-primary/30 bg-primary-soft p-5"
    >
      <h2 id="pending-requests" className="font-semibold">
        طلبات الباقات من أصحاب الأعمال ({requests.data?.length ?? 0})
      </h2>
      {requests.isError && (
        <p role="alert" className="text-sm text-destructive">
          تعذر تحميل الطلبات.
        </p>
      )}
      <ul className="space-y-3">
        {requests.data?.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onDone={() =>
              Promise.all(
                [
                  ["admin-pending-requests"],
                  ["admin-businesses"],
                  ["admin-business"],
                  ["admin-business-subscriptions", request.business_id],
                  ["businesses"],
                  ["business"],
                ].map((queryKey) => qc.invalidateQueries({ queryKey })),
              ).then(() => undefined)
            }
          />
        ))}
      </ul>
    </section>
  );
}

function RequestRow({
  request,
  onDone,
}: {
  request: AdminPendingRequest;
  onDone: () => Promise<void>;
}) {
  const activate = useServerFn(adminActivateSubscription);
  const reject = useServerFn(adminRejectSubscription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);
  const business = request.businesses;

  async function run(action: "activate" | "reject") {
    if (busy) return;
    const label = PLAN_LABELS[request.plan];
    if (
      action === "activate" &&
      !window.confirm(
        `تفعيل ${label} لـ «${business?.name_ar || business?.name || ""}»؟ ستتغير مميزاته فوراً وقد تُخفى الفروع الزائدة دون حذفها.`,
      )
    )
      return;
    let note: string | null = null;
    if (action === "reject") {
      note = window.prompt("سبب الرفض (اختياري، يظهر لصاحب العمل):");
      if (note === null) return;
    }
    setBusy(true);
    setError("");
    try {
      if (action === "activate")
        await activate({
          data: { id: request.id, endsAt: null, paymentStatus: paid ? "paid" : "not_required" },
        });
      else await reject({ data: { id: request.id, note: note?.trim() || null } });
      await onDone();
    } catch (e) {
      setError(friendlyPortalError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            to="/admin/businesses/$id"
            params={{ id: request.business_id }}
            className="font-medium text-primary underline"
          >
            {business?.name_ar || business?.name || request.business_id}
          </Link>
          <p className="text-xs text-muted-foreground">
            من{" "}
            {business
              ? (PLAN_LABELS[business.plan as keyof typeof PLAN_LABELS] ?? business.plan)
              : "—"}{" "}
            إلى <strong>{PLAN_LABELS[request.plan]}</strong> ·{" "}
            {request.period_months === 12 ? "سنة" : "شهر"} · {formatDate(request.requested_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 text-xs">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            تم استلام الدفع
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("activate")}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
          >
            تفعيل
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("reject")}
            className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
          >
            رفض
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}
