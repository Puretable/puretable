import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  adminListBusinessBilling,
  adminSetInvoiceStatus,
  type BusinessBillingRow,
} from "@/lib/admin-billing.functions";
import { formatDate } from "@/lib/owner-portal";
import { PLAN_LABELS } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/admin/business-info")({
  component: BusinessInfoPage,
});

const PAYMENT_LABEL: Record<string, string> = {
  not_required: "غير مطلوب",
  unpaid: "غير مدفوع",
  pending: "قيد المعالجة",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "مسترد",
};

function BusinessInfoPage() {
  const list = useServerFn(adminListBusinessBilling);
  const rows = useQuery({ queryKey: ["admin-business-billing"], queryFn: () => list() });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">بيانات الفوترة ومتابعة الدفع</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          كل الأعمال، تاريخ التسجيل الأحدث أولاً. حالة الفاتورة تُحفظ فور تغييرها.
        </p>
      </div>
      {rows.isError && (
        <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">
          تعذر تحميل البيانات.{" "}
          <button type="button" onClick={() => void rows.refetch()}>
            إعادة المحاولة
          </button>
        </p>
      )}
      {rows.isLoading ? (
        <p role="status">جارٍ التحميل…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b bg-secondary/40 text-start">
                <th className="p-3 text-start font-semibold">اسم العمل</th>
                <th className="p-3 text-start font-semibold">تاريخ التسجيل</th>
                <th className="p-3 text-start font-semibold">الباقة</th>
                <th className="p-3 text-start font-semibold">حالة الدفع</th>
                <th className="p-3 text-start font-semibold">بيانات الفوترة مكتملة؟</th>
                <th className="p-3 text-start font-semibold">الموافقة على الاتفاقية</th>
                <th className="p-3 text-start font-semibold">حالة الفاتورة</th>
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((row) => (
                <Row key={row.id} row={row} />
              ))}
              {rows.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    لا توجد أعمال بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ row }: { row: BusinessBillingRow }) {
  const qc = useQueryClient();
  const setStatus = useServerFn(adminSetInvoiceStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onChange(status: "sent" | "not_sent") {
    setBusy(true);
    setError("");
    qc.setQueryData(["admin-business-billing"], (old: BusinessBillingRow[] | undefined) =>
      old?.map((r) => (r.id === row.id ? { ...r, invoice_status: status } : r)),
    );
    try {
      await setStatus({ data: { businessId: row.id, status } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ");
      await qc.invalidateQueries({ queryKey: ["admin-business-billing"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b last:border-0">
      <td className="p-3">{row.name_ar || row.name}</td>
      <td className="p-3 text-muted-foreground">{formatDate(row.created_at)}</td>
      <td className="p-3">{PLAN_LABELS[row.plan]}</td>
      <td className="p-3">{row.payment_status ? PAYMENT_LABEL[row.payment_status] : "—"}</td>
      <td className="p-3">
        {row.business_info_completed ? (
          <span className="text-primary">نعم</span>
        ) : (
          <span className="text-destructive">لا</span>
        )}
      </td>
      <td className="p-3">
        {row.terms_accepted_at ? (
          <span className="text-primary">نعم — {formatDate(row.terms_accepted_at)}</span>
        ) : (
          <span className="text-destructive">لا</span>
        )}
      </td>
      <td className="p-3">
        <select
          value={row.invoice_status}
          disabled={busy}
          onChange={(e) => void onChange(e.target.value as "sent" | "not_sent")}
          className="rounded-lg border bg-background p-2 text-sm disabled:opacity-60"
        >
          <option value="not_sent">فاتورة غير مرسلة</option>
          <option value="sent">فاتورة مرسلة</option>
        </select>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    </tr>
  );
}
