import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Eye,
  MousePointerClick,
  Users,
  Radio,
  Store,
  Download,
  Fingerprint,
  FileText,
  Sheet,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { getDashboard } from "@/lib/analytics.dashboard.functions";
import { RANGES, RANGE_LABELS, type RangeKey } from "@/lib/analytics.ranges";
import { downloadWorkbook, type Sheet as WorkbookSheet } from "@/lib/export-excel";
import { downloadBusinessCsv } from "@/lib/export-csv";
import { downloadAnalyticsPdf } from "@/lib/export-pdf";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [exportingPdf, setExportingPdf] = useState(false);
  const fetchDashboard = useServerFn(getDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => fetchDashboard({ data: { range } }),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">نظرة عامة وتحليلات</h1>
          <p className="text-sm text-muted-foreground">
            إحصائيات بيور تيبل — مبنية على أحداث محفوظة في قاعدة البيانات
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!data}
            onClick={() => data && downloadBusinessCsv(data, range)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Sheet className="h-4 w-4" /> CSV لـ Google Sheets
          </button>
          <button
            type="button"
            disabled={!data}
            onClick={() => {
              if (!data) return;
              try {
                exportDashboard(data, range);
              } catch (e) {
                alert(`تعذّر إنشاء ملف Excel: ${(e as Error).message}`);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary-soft px-4 py-2 text-sm font-medium text-primary disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> تحميل Excel
          </button>
          <button
            type="button"
            disabled={!data || exportingPdf}
            onClick={async () => {
              if (!data) return;
              setExportingPdf(true);
              try {
                await downloadAnalyticsPdf(data, range);
              } catch (e) {
                alert(`تعذّر إنشاء ملف PDF: ${(e as Error).message}`);
              } finally {
                setExportingPdf(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {exportingPdf ? (
              <Radio className="h-4 w-4 animate-pulse" />
            ) : (
              <FileText className="h-4 w-4" />
            )}{" "}
            تحميل PDF
          </button>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {RANGE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading analytics…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Radio} label="الآن / Online now" value={data.visitors.online} />
            <Stat
              icon={Users}
              label="زوار مختلفون / Unique visitors"
              value={data.totals.uniqueVisitors}
            />
            <Stat icon={Eye} label="مشاهدات الصفحات / Page views" value={data.totals.pageViews} />
            <Stat icon={MousePointerClick} label="النقرات / Clicks" value={data.totals.clicks} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Fingerprint} label="الجلسات / Sessions" value={data.totals.sessions} />
            <Stat
              icon={Eye}
              label="مشاهدات صفحات الأنشطة / Business page views"
              value={data.totals.businessPageViews}
            />
            <Stat
              icon={MousePointerClick}
              label="نقرات التوصيل / Delivery link clicks"
              value={data.deliveryLinks.reduce((n, l) => n + l.count, 0)}
            />
            <Stat
              icon={Radio}
              label="نقرات الفلاتر / Filter clicks"
              value={data.filters.reduce((n, f) => n + f.count, 0)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Mini label="اليوم" value={data.visitors.today} />
            <Mini label="هذا الأسبوع" value={data.visitors.week} />
            <Mini label="هذا الشهر" value={data.visitors.month} />
            <Mini label="٣ أشهر" value={data.visitors.quarter} />
            <Mini label="منذ الإطلاق" value={data.visitors.allTime} />
          </div>

          <Card title="Traffic over time">
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <LineChart data={data.timeseries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="views"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Views"
                  />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Clicks"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Per-business views & clicks">
            {data.businesses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 text-start">Business</th>
                      <th className="py-2 text-end">Views</th>
                      <th className="py-2 text-end">Maps</th>
                      <th className="py-2 text-end">Delivery</th>
                      <th className="py-2 text-end">Website</th>
                      <th className="py-2 text-end">Phone</th>
                      <th className="py-2 text-end">Favorites</th>
                      <th className="py-2 text-end">Social</th>
                      <th className="py-2 text-end">Total clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.businesses.map((b) => (
                      <tr key={b.id} className="border-b border-border/60">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-2">
                            <Store className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate">{b.name}</span>
                          </span>
                        </td>
                        <td className="py-2 text-end font-medium">{b.views}</td>
                        <td className="py-2 text-end">{b.maps}</td>
                        <td className="py-2 text-end">{b.delivery}</td>
                        <td className="py-2 text-end">{b.website}</td>
                        <td className="py-2 text-end">{b.phone}</td>
                        <td className="py-2 text-end">{b.favorites}</td>
                        <td className="py-2 text-end">{b.social}</td>
                        <td className="py-2 text-end font-semibold text-primary">{b.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Delivery links — clicks per link">
            {data.deliveryLinks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.deliveryLinks.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{l.business}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {l.platform}
                        {l.product ? ` · ${l.product}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                      {l.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankList
              title="Main filter clicks"
              items={data.mainFilters.map((r) => ({ label: r.label, value: r.count }))}
            />
            <RankList
              title="Secondary category clicks"
              items={data.secondaryFilters.map((r) => ({ label: r.label, value: r.count }))}
            />
            <RankList
              title="Top search terms"
              items={data.searches.map((r) => ({ label: r.term, value: r.count }))}
            />
            <RankList
              title="Top cities"
              items={data.cities.map((r) => ({ label: r.city, value: r.count }))}
            />
            <Card title="Clicks by platform">
              <div className="h-56 w-full">
                <ResponsiveContainer>
                  <BarChart data={data.platforms}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="platform" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <div className="mt-2 font-display text-3xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-display text-xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h3 className="font-display text-sm font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function RankList({ title, items }: { title: string; items: { label: string; value: number }[] }) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
                {r.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/** Exports every dashboard table for the selected period as a real Excel file. */
function exportDashboard(data: Dashboard, range: RangeKey) {
  const sheets: WorkbookSheet[] = [
    {
      name: "Summary",
      rows: [
        ["Metric", "Value"],
        ["Range", RANGE_LABELS[range]],
        ["Generated at", new Date().toLocaleString()],
        ["Online now", data.visitors.online],
        ["Unique visitors (range)", data.totals.uniqueVisitors],
        ["Sessions (range)", data.totals.sessions],
        ["Page views", data.totals.pageViews],
        ["Business page views", data.totals.businessPageViews],
        ["Clicks", data.totals.clicks],
        ["Visitors today", data.visitors.today],
        ["Visitors this week", data.visitors.week],
        ["Visitors this month", data.visitors.month],
        ["Visitors 90 days", data.visitors.quarter],
        ["Visitors all time", data.visitors.allTime],
      ],
    },
    {
      name: "Businesses",
      rows: [
        [
          "Business",
          "City",
          "Plan",
          "Views",
          "Impressions",
          "Maps",
          "Delivery",
          "Booking",
          "WhatsApp",
          "Website",
          "Phone",
          "Contact clicks",
          "Favorites",
          "Social",
          "Other",
          "Total clicks",
        ],
        ...data.businesses.map((b) => [
          b.name,
          b.city,
          b.plan ?? "free",
          b.views,
          b.impressions ?? 0,
          b.maps,
          b.delivery,
          b.booking ?? 0,
          b.whatsapp ?? 0,
          b.website,
          b.phone,
          b.contactClicks,
          b.favorites,
          b.social,
          b.other,
          b.clicks,
        ]),
      ],
    },
    {
      name: "Delivery links",
      rows: [
        ["Business", "Platform", "Product", "URL", "Clicks"],
        ...data.deliveryLinks.map((l) => [l.business, l.platform, l.product ?? "", l.url, l.count]),
      ],
    },
    {
      name: "Filters",
      rows: [
        ["Filter", "Type", "Clicks"],
        ...data.mainFilters.map((f) => [f.label, "main", f.count]),
        ...data.secondaryFilters.map((f) => [f.label, "secondary", f.count]),
      ],
    },
    { name: "Searches", rows: [["Term", "Count"], ...data.searches.map((s) => [s.term, s.count])] },
    {
      name: "Cities",
      rows: [["City", "Page views"], ...data.cities.map((c) => [c.city, c.count])],
    },
    {
      name: "Platforms",
      rows: [["Platform", "Clicks"], ...data.platforms.map((p) => [p.platform, p.count])],
    },
    {
      name: "Daily",
      rows: [
        ["Date", "Views", "Clicks"],
        ...data.timeseries.map((d) => [d.date, d.views, d.clicks]),
      ],
    },
  ];
  downloadWorkbook(
    `pure-table-analytics-${range}-${new Date().toISOString().slice(0, 10)}`,
    sheets,
  );
}
