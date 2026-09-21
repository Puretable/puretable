import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Instagram, Mail, Phone, UserRound, Music2, MessageCircle, Heart } from "lucide-react";
import { emailHref, instagramHref, tiktokHref, whatsappHref } from "@/lib/contact";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LogoMark } from "./Logo";
import { supabase } from "@/integrations/supabase/client";
import { useSiteText } from "@/hooks/use-site-settings";
import { useFilters } from "@/lib/filters";
import { track } from "@/lib/track";
import { ComingSoon } from "./ComingSoon";
import { DeveloperCredit } from "./DeveloperCredit";

function useSession() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN" || e === "SIGNED_OUT") setSignedIn(e === "SIGNED_IN");
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

export function SiteHeader() {
  const { t } = useTranslation();
  const { text, shows } = useSiteText();
  const signedIn = useSession();
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:flex-nowrap sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-1">
          <LogoMark className="h-11 shrink-0 sm:h-12" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="font-display text-lg font-semibold tracking-tight sm:text-xl">
              {t("brand.name")}
            </span>
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
              {text("brand.tagline")}
            </span>
          </span>
        </Link>
        <div className="hidden lg:block" />

        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
          {shows("header_language") && <LanguageSwitcher />}
          <Link
            to="/favorites"
            aria-label={t("nav.favorites")}
            title={t("nav.favorites")}
            className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Heart className="h-4 w-4" />
          </Link>
          {signedIn ? (
            <Link
              to="/profile"
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground lg:inline-flex"
            >
              <UserRound className="h-3.5 w-3.5" /> حسابي
            </Link>
          ) : (
            <Link
              to="/auth"
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground lg:inline-flex"
            >
              {t("nav.sign_in")}
            </Link>
          )}
          {shows("header_cta") && (
            <Link
              to="/portal"
              className="inline-flex rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition hover:opacity-90 sm:px-4 sm:text-sm"
            >
              {t("nav.owner_portal")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useTranslation();
  const { text } = useSiteText();
  const { secondary: cats } = useFilters();
  const email = text("contact_info.email");
  const phone = text("contact_info.phone");
  // Pure Table's official accounts, edited centrally in Admin → Appearance.
  const val = (key: string) => {
    const v = text(key);
    return v && v !== key ? v : "";
  };
  const socials = [
    {
      key: "instagram",
      label: "Instagram",
      icon: Instagram,
      href: instagramHref(val("contact_info.instagram")),
    },
    { key: "tiktok", label: "TikTok", icon: Music2, href: tiktokHref(val("contact_info.tiktok")) },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      href: whatsappHref(val("contact_info.whatsapp")),
    },
    { key: "email", label: "Email", icon: Mail, href: emailHref(val("contact_info.email")) },
  ].filter((s): s is typeof s & { href: string } => !!s.href);
  return (
    <footer className="mt-24 border-t border-border/60 bg-secondary/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-1">
            <LogoMark className="h-12" />
            <span className="font-display text-xl font-semibold">{t("brand.name")}</span>
          </div>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold">{t("footer.explore")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {cats.map((c) => (
              <li key={c.path}>
                <Link
                  to={c.path}
                  onClick={() =>
                    track({
                      event_type: "filter_click",
                      platform: c.primary ? "main" : "secondary",
                      label: c.value,
                    })
                  }
                  className="hover:text-foreground"
                >
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-display text-sm font-semibold">{t("footer.get_in_touch")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {email && email !== "contact_info.email" && (
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />{" "}
                <a href={`mailto:${email}`} className="hover:text-foreground">
                  {email}
                </a>
              </li>
            )}
            {phone && phone !== "contact_info.phone" && (
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />{" "}
                <a href={`tel:${phone}`} dir="ltr" className="hover:text-foreground">
                  {phone}
                </a>
              </li>
            )}
          </ul>
          {/* Pure Table's own accounts — each icon appears only once it is filled in from the admin. */}
          {socials.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              {socials.map((s) => (
                <a
                  key={s.key}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={s.label}
                  title={s.label}
                  className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
          <h4 className="mt-6 font-display text-sm font-semibold">{t("footer.legal")}</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/privacy" className="hover:text-foreground">
                {t("footer.privacy")}
              </Link>
            </li>
            <li>
              <Link to="/terms" className="hover:text-foreground">
                {t("footer.terms")}
              </Link>
            </li>
            <li>
              <Link to="/complaints" className="hover:text-foreground">
                {t("footer.complaints")}
              </Link>
            </li>
            <li>
              <Link to="/faq" className="hover:text-foreground">
                {t("footer.faq")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <span>
            © {new Date().getFullYear()} {t("brand.name")}. {t("footer.copyright")}
          </span>
          <DeveloperCredit />
        </div>
      </div>
    </footer>
  );
}

/** Pages that stay reachable while the site is in pre-launch mode. */
const PRELAUNCH_OPEN = [
  "/waitlist",
  "/auth",
  "/admin-login",
  "/profile",
  "/portal",
  "/favorites",
  "/reset-password",
  "/privacy",
  "/terms",
  "/complaints",
  "/faq",
  "/admin",
];

export function Page({ children }: { children: ReactNode }) {
  const { shows } = useSiteText();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const open = PRELAUNCH_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!shows("site_live") && !open) return <ComingSoon />;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
