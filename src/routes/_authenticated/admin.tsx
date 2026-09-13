import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Store,
  LogOut,
  UploadCloud,
  Palette,
  Inbox,
  Moon,
  Sun,
  ScrollText,
  Handshake,
  Layers,
  ExternalLink,
  KeyRound,
  Award,
  Tags,
  ShieldCheck,
  HelpCircle,
  MessageSquareWarning,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { isAdmin } from "@/lib/admin.functions";
import { LogoMark } from "@/components/site/Logo";
import { ADMIN_KEY } from "@/lib/track";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [{ title: "الإدارة — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});
const groups = [
  {
    title: "إدارة المنصة",
    links: [
      { to: "/admin", label: "نظرة عامة وتحليلات", icon: LayoutDashboard, exact: true },
      { to: "/admin/businesses", label: "الأعمال والفروع", icon: Store, exact: false },
      { to: "/admin/categories", label: "التصنيفات", icon: Tags, exact: false },
      { to: "/admin/subscriptions", label: "الاشتراكات والباقات", icon: Layers, exact: false },
      { to: "/admin/success-partners", label: "شركاء الانطلاق", icon: Award, exact: false },
    ],
  },
  {
    title: "التواصل",
    links: [
      { to: "/admin/messages", label: "الرسائل", icon: Inbox, exact: false },
      { to: "/admin/complaints", label: "الشكاوى", icon: MessageSquareWarning, exact: false },
      { to: "/admin/leads", label: "طلبات الشراكة", icon: Handshake, exact: false },
    ],
  },
  {
    title: "الإعدادات والأدوات",
    links: [
      { to: "/admin/account", label: "تغيير كلمة المرور", icon: KeyRound, exact: false },
      { to: "/admin/appearance", label: "مظهر الموقع", icon: Palette, exact: false },
      { to: "/admin/safety", label: "نظام نقاط الأمان", icon: ShieldCheck, exact: false },
      { to: "/admin/faqs", label: "الأسئلة الشائعة", icon: HelpCircle, exact: false },
      { to: "/admin/import", label: "استيراد البيانات", icon: UploadCloud, exact: false },
      { to: "/admin/audit", label: "سجل التغييرات", icon: ScrollText, exact: false },
    ],
  },
] as const;

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const checkAdmin = useServerFn(isAdmin);
  const [status, setStatus] = useState<"loading" | "admin" | "not_admin" | "error">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    setDark(localStorage.getItem("pt-admin-theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const result = await checkAdmin();
        if (cancelled) return;
        setEmail(data.user?.email ?? null);
        setStatus(result.isAdmin ? "admin" : "not_admin");
        if (result.isAdmin) localStorage.setItem(ADMIN_KEY, "1");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkAdmin, attempt]);
  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem(ADMIN_KEY);
    void navigate({ to: "/admin-login" });
  }
  if (status === "loading")
    return (
      <div role="status" className="grid min-h-screen place-items-center text-sm">
        جارٍ التحقق من صلاحيات الإدارة…
      </div>
    );
  if (status !== "admin")
    return (
      <div dir="rtl" className="mx-auto grid min-h-screen max-w-md content-center gap-4 p-6">
        <h1 className="text-2xl font-semibold">
          {status === "error" ? "تعذر التحقق من الصلاحيات" : "هذا الحساب لا يملك صلاحية الإدارة"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {email} — استخدم البريد المضاف كأدمن، وأكمل تفعيله من رسالة الدعوة.
        </p>
        {status === "error" && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-lg border p-3"
          >
            إعادة المحاولة
          </button>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg bg-primary p-3 text-primary-foreground"
        >
          تسجيل الخروج
        </button>
      </div>
    );
  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:block focus:p-3">
        الانتقال إلى المحتوى
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 p-4">
          <Link to="/admin" className="flex items-center gap-2">
            <LogoMark className="h-9 w-9" />
            <span className="font-semibold">
              Pure Table{" "}
              <span className="block text-xs font-normal text-muted-foreground">لوحة الإدارة</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span dir="ltr" className="hidden text-xs text-muted-foreground md:block">
              {email}
            </span>
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              عرض الموقع
            </Link>
            <button
              type="button"
              aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"}
              onClick={() =>
                setDark((value) => {
                  localStorage.setItem("pt-admin-theme", !value ? "dark" : "light");
                  return !value;
                })
              }
              className="rounded-lg border p-2"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              خروج
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[210px_minmax(0,1fr)]">
        <button
          type="button"
          aria-expanded={navOpen}
          aria-controls="admin-navigation"
          onClick={() => setNavOpen(!navOpen)}
          className="m-4 mb-0 rounded-lg border px-4 py-3 text-sm lg:hidden"
        >
          {navOpen ? "إغلاق قائمة الأقسام" : "أقسام لوحة الإدارة"}
        </button>
        <nav
          id="admin-navigation"
          aria-label="أقسام لوحة الإدارة"
          className={`${navOpen ? "grid" : "hidden"} gap-3 border-b p-4 sm:grid-cols-3 lg:sticky lg:top-0 lg:block lg:h-fit lg:space-y-6 lg:border-b-0 lg:border-e`}
        >
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 text-xs font-semibold text-muted-foreground">{group.title}</h2>
              <div className="space-y-1">
                {group.links.map((link) => {
                  const active = link.exact
                    ? pathname === link.to || pathname === link.to + "/"
                    : pathname.startsWith(link.to);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={() => setNavOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${active ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                    >
                      <link.icon className="h-4 w-4 shrink-0" />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <main id="admin-content" className="min-w-0 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
