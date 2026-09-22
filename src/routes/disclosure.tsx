import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Page } from "@/components/site/Layout";
import { usePageView } from "@/hooks/use-page-view";
import { emailHref } from "@/lib/contact";
import { getDisclosurePublic } from "@/lib/disclosure.functions";
import { NotFoundComponent } from "./__root";

export const Route = createFileRoute("/disclosure")({
  ssr: false,
  head: () => ({
    meta: [{ title: "الإفصاح التجاري — Pure Table" }, { name: "robots", content: "noindex" }],
  }),
  component: DisclosurePage,
});

/**
 * Static UI labels shown next to each admin-entered value below. Kept in the `disclosure.*` i18n
 * namespace; the actual VALUES come from the `business_disclosure` table (row-level security, not
 * this page) so a draft can never be visible before an admin activates it — see the migration and
 * `disclosure.functions.ts` for why this is a dedicated table rather than site-wide content.
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
  const load = useServerFn(getDisclosurePublic);
  const { data, isLoading } = useQuery({
    queryKey: ["disclosure-public"],
    queryFn: () => load(),
  });

  // While loading, render nothing rather than a flash of "not found" or the real data.
  if (isLoading) return null;
  // RLS filters the row out entirely while inactive — `data` is `null` either way, so an inactive
  // page and a URL that never existed are indistinguishable, including to a direct visit.
  if (!data) return <NotFoundComponent />;

  const rows = FIELD_KEYS.map((key) => ({
    key,
    label: t(`disclosure.${key}`),
    value: data[key] ?? "",
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
