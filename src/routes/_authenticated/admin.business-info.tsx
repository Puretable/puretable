import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import {
  adminListBusinessBilling,
  adminSetInvoiceStatus,
  type BusinessBillingRow,
} from "@/lib/admin-billing.functions";
import { formatDate } from "@/lib/owner-portal";
import { PLAN_LABELS } from "@/lib/plans";

const NOT_ENTERED = "لم تُدخل بعد";

/** One labeled value with a copy button; shows "لم تُدخل بعد" when there is nothing to copy. */
function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border bg-background p-2.5">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={value ? "mt-0.5 text-sm" : "mt-0.5 text-sm text-muted-foreground"}>
          {value || NOT_ENTERED}
        </p>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={`نسخ ${label}`}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

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
                <th className="p-3 text-start font-semibold" />
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
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
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
  const [expanded, setExpanded] = useState(false);

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
    <>
      <tr className="border-b last:border-0">
        <td className="p-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "إخفاء بيانات الفوترة" : "عرض بيانات الفوترة"}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
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
      {expanded && (
        <tr className="border-b bg-secondary/20 last:border-0">
          <td colSpan={8} className="p-4">
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <CopyField label="الاسم التجاري" value={row.invoice_trade_name} />
              <CopyField label="رقم السجل التجاري" value={row.invoice_cr_number} />
              <CopyField label="الرقم الضريبي" value={row.invoice_tax_number} />
              <CopyField label="العنوان" value={row.invoice_address} />
              <CopyField label="البريد الإلكتروني" value={row.invoice_email} />
              <CopyField label="رقم الهاتف" value={row.invoice_phone} />
              <CopyField label="اسم الممثل" value={row.invoice_representative_name} />
              <CopyField label="لقب/منصب الممثل" value={row.invoice_representative_title} />
              <CopyField
                label="تاريخ الموافقة على الاتفاقية"
                value={row.terms_accepted_at ? formatDate(row.terms_accepted_at) : null}
              />
              <CopyField label="إصدار الاتفاقية الموافق عليه" value={row.terms_version} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
