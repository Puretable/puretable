import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Page } from "@/components/site/Layout";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { usePageView } from "@/hooks/use-page-view";
import { emailHref } from "@/lib/contact";
import { NotFoundComponent } from "./__root";

export const Route = createFileRoute("/disclosure")({
  ssr: false,
  head: () => ({
    meta: [{ title: "الإفصاح التجاري — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: DisclosurePage,
});

/**
 * Fields the admin enters at Admin → Appearance → "الإفصاح التجاري". Stored under a
 * `disclosure_info.*` content key — deliberately NOT `disclosure.*`, which is the i18n namespace
 * for this page's static labels below; site_settings content overrides i18n strings at the same
 * dotted key (see `toResourceBundle`), so sharing the namespace would silently replace each label
 * with the admin-entered value instead of showing both. Never machine-translated either way: a
 * legal/commercial name or registration number must be shown exactly as entered.
 */
const FIELD_KEYS = [
  "business_name",
  "owner_name",
  "cr_number",
  "address",
  "email",
  "phone",
] as const;

function DisclosurePage() {
  const { t } = useTranslation();
  usePageView();
  const settings = useSiteSettings();
  // Deliberately not `shows()`: that helper defaults a toggle to visible when unset, which is
  // backwards here — the disclosure page must default to hidden until an admin turns it on.
  const active = settings.sections["disclosure_active"] === true;
  if (!active) return <NotFoundComponent />;

  const value = (key: (typeof FIELD_KEYS)[number]) =>
    settings.content[`disclosure_info.${key}`]?.ar?.trim() ?? "";
  const rows = FIELD_KEYS.map((key) => ({
    key,
    label: t(`disclosure.${key}`),
    value: value(key),
  })).filter((row) => row.value);

  return (
    <Page>
      <section dir="rtl" className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {t("disclosure.title")}
        </h1>
        {rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("legal.empty")}</p>
        ) : (
          <dl className="mt-8 divide-y divide-border rounded-2xl border border-border">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid gap-1 p-4 sm:grid-cols-3 sm:items-baseline sm:gap-4"
              >
                <dt className="text-sm font-medium text-muted-foreground">{row.label}</dt>
                <dd className="text-sm text-foreground sm:col-span-2" dir="auto">
                  {row.key === "email" ? (
                    <a href={emailHref(row.value) ?? undefined} className="hover:text-primary">
                      {row.value}
                    </a>
                  ) : row.key === "phone" ? (
                    <a href={`tel:${row.value}`} dir="ltr" className="hover:text-primary">
                      {row.value}
                    </a>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </Page>
  );
}
