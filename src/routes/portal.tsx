import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Crown,
  History,
  Image as ImageIcon,
  Layers,
  Link2,
  LogOut,
  Lock,
  Check,
  MapPin,
  Store,
  Utensils,
} from "lucide-react";
import { Page } from "@/components/site/Layout";
import { OwnerLogin } from "@/components/portal/OwnerLogin";
import { OwnerAnalytics } from "@/components/portal/OwnerAnalytics";
import { PlanPicker } from "@/components/portal/PlanPicker";
import { OwnerWorkspace, type ManageTab } from "@/components/portal/OwnerWorkspace";
import { SubscriptionHistory } from "@/components/portal/SubscriptionHistory";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerHistory, getOwnerOverview, listPlanCatalog } from "@/lib/owner-portal.functions";
import {
  STATUS_LABELS,
  daysRemaining,
  formatDate,
  friendlyPortalError,
  isExpiringSoon,
  ownerFeatures,
  type OwnerBusiness,
} from "@/lib/owner-portal";
import { PLAN_LABELS } from "@/lib/plans";

export const Route = createFileRoute("/portal")({
  ssr: false,
  head: () => ({
    meta: [{ title: "بوابة أصحاب الأعمال — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: PortalPage,
});

type AuthState =
  | { state: "loading" }
  | { state: "out" }
  | { state: "in"; userId: string; email: string };

function PortalPage() {
  const [auth, setAuth] = useState<AuthState>({ state: "loading" });
  useEffect(() => {
    const apply = (session: { user: { id: string; email?: string } } | null) =>
      setAuth(
        session
          ? { state: "in", userId: session.user.id, email: session.user.email ?? "" }
          : { state: "out" },
      );
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    return () => sub.subscription.unsubscribe();
  }, []);
  return (
    <Page>
      {auth.state === "loading" ? (
        <p role="status" className="p-16 text-center">
          جارٍ التحميل…
        </p>
      ) : auth.state === "out" ? (
        <OwnerLogin />
      ) : (
        <OwnerDashboard userId={auth.userId} email={auth.email} />
      )}
    </Page>
  );
}

type Tab = "overview" | ManageTab | "plans" | "history";
const MANAGE_TABS: readonly Tab[] = ["info", "branches", "photos", "links", "menu"];

function OwnerDashboard({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const loadOverview = useServerFn(getOwnerOverview);
  const loadCatalog = useServerFn(listPlanCatalog);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [signingOut, setSigningOut] = useState(false);

  const overview = useQuery({
    queryKey: ["owner-overview", userId],
    queryFn: () => loadOverview(),
    retry: false,
  });
  const catalog = useQuery({
    queryKey: ["plan-catalog"],
    queryFn: () => loadCatalog(),
    staleTime: 60_000,
  });
  const businesses = overview.data ?? [];
  const business = businesses.find((b) => b.id === selectedId) ?? businesses[0];

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut({ scope: "local" });
    qc.clear();
  }

  if (overview.isLoading)
    return (
      <p role="status" className="p-16 text-center">
        جارٍ تحميل حسابك…
      </p>
    );

  const header = (
    <header className="flex flex-wrap items-center gap-4 rounded-3xl border border-primary/15 bg-primary-soft p-6 sm:p-8">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-primary">بوابة أصحاب الأعمال</p>
        <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">
          {business ? business.name_ar || business.name : "مرحباً بك"}
        </h1>
        <p dir="ltr" className="mt-2 break-all text-right text-sm text-muted-foreground">
          {email}
        </p>
      </div>
      <button
        type="button"
        disabled={signingOut}
        onClick={() => void signOut()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-background px-4 text-sm"
      >
        <LogOut className="h-4 w-4" /> تسجيل الخروج
      </button>
    </header>
  );

  if (overview.isError || !business)
    return (
      <section dir="rtl" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {header}
        <div
          role={overview.isError ? "alert" : "status"}
          className="mt-8 rounded-2xl border bg-card p-8 text-center"
        >
          {overview.isError ? (
            <>
              <p>{friendlyPortalError(overview.error)}</p>
              <button onClick={() => void overview.refetch()} className="mt-3 underline">
                إعادة المحاولة
              </button>
            </>
          ) : (
            <>
              <p className="font-medium">لا يوجد عمل مرتبط بهذا البريد.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                تربط الإدارة بريدك بحساب عملك. إذا كنت صاحب عمل، تواصل معنا ليتم ربط هذا البريد.
              </p>
              <Link
                to="/contact"
                className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm text-primary-foreground"
              >
                تواصل معنا
              </Link>
            </>
          )}
        </div>
      </section>
    );

  return (
    <section dir="rtl" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {header}
      {businesses.length > 1 && (
        <label className="mt-5 block max-w-sm text-sm">
          العمل
          <select
            value={business.id}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setTab("overview");
            }}
            className="mt-2 w-full rounded-xl border bg-background p-3"
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name_ar || b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          aria-label="أقسام البوابة"
          className="flex flex-wrap gap-2 self-start rounded-2xl border bg-card p-3 lg:flex-col"
        >
          {(
            [
              { id: "overview", label: "نظرة عامة", icon: Layers },
              { id: "info", label: "بيانات العمل", icon: Store },
              { id: "branches", label: "الفروع", icon: MapPin },
              { id: "photos", label: "الصور", icon: ImageIcon },
              { id: "links", label: "روابط الطلب", icon: Link2 },
              { id: "menu", label: "قائمة الطعام", icon: Utensils },
              { id: "plans", label: "الباقات", icon: Crown },
              { id: "history", label: "سجل الاشتراكات", icon: History },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 text-sm ${tab === item.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 rounded-2xl border bg-card p-5 sm:p-8">
          {tab === "overview" && (
            <Overview business={business} onChoosePlan={() => setTab("plans")} />
          )}
          {MANAGE_TABS.includes(tab) && (
            <OwnerWorkspace key={business.id} overview={business} tab={tab as ManageTab} />
          )}
          {tab === "plans" &&
            (business.access_suspended ? (
              <SuspendedNotice business={business} />
            ) : (
              <PlanPicker business={business} catalog={catalog.data} />
            ))}
          {tab === "history" && <History_ business={business} />}
        </div>
      </div>
    </section>
  );
}

function Overview({
  business,
  onChoosePlan,
}: {
  business: OwnerBusiness;
  onChoosePlan: () => void;
}) {
  const current = business.current;
  const left = daysRemaining(current?.ends_at ?? null);
  const previous = Math.max(0, business.activated_count - (current?.starts_at ? 1 : 0));
  return (
    <div className="space-y-8">
      <section aria-labelledby="current-plan" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="current-plan" className="text-xl font-semibold">
            اشتراكك الحالي
          </h2>
          <button
            type="button"
            onClick={onChoosePlan}
            className="min-h-11 rounded-full bg-primary px-5 text-sm text-primary-foreground"
          >
            تغيير الباقة
          </button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="الباقة" value={PLAN_LABELS[current?.plan ?? business.plan]} />
          <Info label="الحالة" value={current ? STATUS_LABELS[current.status] : "—"} />
          <Info label="تاريخ التفعيل" value={formatDate(current?.starts_at)} />
          <Info
            label="تاريخ الانتهاء"
            value={current?.ends_at ? formatDate(current.ends_at) : "بدون انتهاء"}
            hint={left === null ? undefined : `متبقي ${left} يوم`}
            warn={isExpiringSoon(current?.ends_at ?? null)}
          />
          <Info label="اشتراكات سابقة" value={String(previous)} />
          <Info
            label="إجمالي الباقات المفعّلة"
            value={String(business.activated_count)}
            hint="تشمل الحالية"
          />
        </dl>
        {business.access_suspended && <SuspendedNotice business={business} />}
        {business.pending && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm"
          >
            <CalendarClock className="h-4 w-4 shrink-0" />
            طلب الباقة {PLAN_LABELS[business.pending.plan]} بانتظار تفعيل الإدارة منذ{" "}
            {formatDate(business.pending.requested_at)}.
          </p>
        )}
        {!business.published && (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            صفحة عملك غير منشورة حالياً، لذلك لا تظهر للزوار.
          </p>
        )}
      </section>
      <section aria-labelledby="features" className="space-y-4">
        <h2 id="features" className="text-xl font-semibold">
          مميزات باقتك
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ownerFeatures(business).map((feature) => (
            <li
              key={feature.key}
              className={`flex items-start gap-3 rounded-xl border p-4 ${feature.available ? "bg-background" : "border-dashed bg-secondary/30 text-muted-foreground"}`}
            >
              {feature.available ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>
                <span className="block text-sm font-medium">{feature.label}</span>
                <span className="block text-xs">{feature.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {business.usage.branches_hidden_by_plan > 0 && (
          <p className="rounded-xl border p-4 text-sm">
            {business.usage.branches_hidden_by_plan} فرع مخفي بسبب حدود باقتك الحالية. تعود للظهور
            عند الترقية.
          </p>
        )}
      </section>
      <OwnerAnalytics business={business} />
    </div>
  );
}

function History_({ business }: { business: OwnerBusiness }) {
  const load = useServerFn(getOwnerHistory);
  const history = useQuery({
    queryKey: ["owner-history", business.id],
    queryFn: () => load({ data: { businessId: business.id } }),
  });
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">سجل الاشتراكات</h2>
      <p className="text-sm text-muted-foreground">
        عدد الباقات المفعّلة: <strong>{business.activated_count}</strong>
      </p>
      <SubscriptionHistory
        rows={history.data}
        loading={history.isLoading}
        error={history.isError}
      />
    </section>
  );
}

function Info({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
      {hint && (
        <p className={`mt-1 text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function SuspendedNotice({ business }: { business: OwnerBusiness }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="font-medium text-destructive">تم تعليق الوصول والاشتراك من قبل الإدارة</p>
        <p className="mt-1 text-muted-foreground">
          يمكنك الاطلاع على بياناتك فقط، وتعمل صفحتك بمزايا الباقة المجانية إلى حين إعادة التفعيل.{" "}
          {business.suspension_reason ? `السبب: ${business.suspension_reason}.` : ""} تواصل معنا
          لإعادة التفعيل.
        </p>
      </div>
    </div>
  );
}
