import {
  PAYMENT_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  formatDate,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "@/lib/owner-portal";
import { PLAN_LABELS } from "@/lib/plans";

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  active: "bg-primary/10 text-primary",
  pending: "bg-amber-100 text-amber-900",
  suspended: "bg-destructive/10 text-destructive",
  expired: "bg-secondary text-muted-foreground",
  superseded: "bg-secondary text-muted-foreground",
  cancelled: "bg-secondary text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

/** Shared by the owner portal and the admin business page. */
export function SubscriptionHistory({
  rows,
  loading,
  error,
}: {
  rows: SubscriptionRow[] | undefined;
  loading?: boolean;
  error?: boolean;
}) {
  if (loading) return <p role="status">جارٍ تحميل السجل…</p>;
  if (error) return <p role="alert">تعذر تحميل سجل الاشتراكات.</p>;
  if (!rows?.length)
    return <p className="text-sm text-muted-foreground">لا توجد اشتراكات مسجلة بعد.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-start text-sm">
        <thead className="bg-secondary/50 text-xs text-muted-foreground">
          <tr>
            <th className="p-3 text-start font-medium">الباقة</th>
            <th className="p-3 text-start font-medium">الحالة</th>
            <th className="p-3 text-start font-medium">تاريخ الطلب</th>
            <th className="p-3 text-start font-medium">التفعيل</th>
            <th className="p-3 text-start font-medium">الانتهاء</th>
            <th className="p-3 text-start font-medium">الدفع</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t align-top">
              <td className="p-3">
                <span className="font-medium">{PLAN_LABELS[row.plan]}</span>
                <span className="block text-xs text-muted-foreground">
                  {SOURCE_LABELS[row.source]}
                </span>
              </td>
              <td className="p-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}
                >
                  {STATUS_LABELS[row.status]}
                </span>
                {row.notes && (
                  <span className="mt-1 block text-xs text-muted-foreground">{row.notes}</span>
                )}
              </td>
              <td className="p-3">{formatDate(row.requested_at)}</td>
              <td className="p-3">{formatDate(row.starts_at)}</td>
              <td className="p-3">
                {row.ends_at ? formatDate(row.ends_at) : row.starts_at ? "بدون انتهاء" : "—"}
              </td>
              <td className="p-3">{PAYMENT_LABELS[row.payment_status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
