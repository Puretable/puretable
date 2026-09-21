import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Lock } from "lucide-react";
import { getOwnerReport } from "@/lib/owner-portal.functions";
import { friendlyPortalError, type OwnerBusiness, type OwnerReport } from "@/lib/owner-portal";

const RANGES = [7, 30, 90] as const;

function Stat({ label, value, previous }: { label: string; value: number; previous?: number }) {
  const change =
    previous && previous > 0 ? Math.round(((value - previous) / previous) * 100) : null;
  return (
    <div className="rounded-xl border bg-background p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("en-US")}</p>
      {change !== null && (
        <p
          dir="ltr"
          className={`mt-1 text-right text-xs ${change >= 0 ? "text-primary" : "text-destructive"}`}
        >
          {change >= 0 ? "+" : ""}
          {change}% عن الفترة السابقة
        </p>
      )}
    </div>
  );
}

export function OwnerAnalytics({ business }: { business: OwnerBusiness }) {
  const read = useServerFn(getOwnerReport);
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const level = business.entitlements.analytics;
  const report = useQuery<OwnerReport>({
    queryKey: ["owner-report", business.id, days, level],
    enabled: level !== "none",
    queryFn: () => read({ data: { businessId: business.id, days } }),
  });

  if (level === "none")
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center">
        <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-3 font-medium">التحليلات غير متاحة في باقتك الحالية</p>
        <p className="mt-1 text-sm text-muted-foreground">
          رقِّ إلى Pro لعرض الزيارات والنقرات، أو Premium للمقارنة والتفاصيل الكاملة.
        </p>
      </div>
    );

  const data = report.data;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" /> أداء صفحتك
        </h3>
        <div role="group" aria-label="الفترة" className="flex gap-2">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={days === range}
              onClick={() => setDays(range)}
              className={`min-h-11 rounded-full px-4 text-xs ${days === range ? "bg-primary text-primary-foreground" : "border"}`}
            >
              {range} يوماً
            </button>
          ))}
        </div>
      </div>
      {report.isLoading && <p role="status">جارٍ تحميل الأداء…</p>}
      {report.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyPortalError(report.error)}
        </p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="ظهور في القوائم" value={data.impressions} />
            <Stat label="زيارات الصفحة" value={data.views} previous={data.previous?.views} />
            <Stat label="إجمالي النقرات" value={data.clicks} previous={data.previous?.clicks} />
            <Stat label="نقرات التواصل" value={data.contactClicks} />
          </div>
          {data.level === "full" && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="الخريطة" value={data.maps ?? 0} />
              <Stat label="التوصيل" value={data.delivery ?? 0} />
              <Stat label="واتساب" value={data.whatsapp ?? 0} />
              <Stat label="المفضلة" value={data.favorites ?? 0} />
            </div>
          )}
          {data.level === "basic" && (
            <p className="text-xs text-muted-foreground">
              المقارنة بالفترة السابقة وتفصيل النقرات متاحان في Premium.
            </p>
          )}
        </>
      )}
    </section>
  );
}
