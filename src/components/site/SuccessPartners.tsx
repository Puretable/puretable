import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listSuccessPartners } from "@/lib/success-partners.functions";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function SuccessPartners() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith("ar") ? "ar" : "en";
  const { data = [] } = useQuery({
    queryKey: ["success-partners"],
    queryFn: () => listSuccessPartners(),
    staleTime: 300_000,
  });
  if (!data.length) return null;

  return (
    <section
      aria-labelledby="success-partners-title"
      className="mx-auto mt-20 w-full max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-b from-primary-soft/70 to-card px-5 py-10 shadow-[var(--shadow-soft)] sm:px-8 sm:py-12">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {lang === "ar" ? "معاً نصنع الأثر" : "Stronger together"}
          </p>
          <h2
            id="success-partners-title"
            className="mt-3 font-display text-2xl font-semibold sm:text-3xl"
          >
            {lang === "ar" ? "شركاء الانطلاق" : "Launch Partners"}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {lang === "ar"
              ? "نفخر بالجهات والمحلات التي تشاركنا بناء تجربة أفضل لمجتمعنا."
              : "We are proud of the organizations and businesses helping us build a better community experience."}
          </p>
        </div>
        <ul className="mt-8 flex flex-wrap justify-center gap-3">
          {data.map((partner) => {
            const name = lang === "ar" ? partner.name_ar || partner.name : partner.name;
            const content = (
              <>
                <div className="flex h-24 w-full items-center justify-center rounded-2xl bg-background p-4">
                  {partner.logo_url ? (
                    <img
                      src={partner.logo_url}
                      alt=""
                      loading="lazy"
                      width={180}
                      height={96}
                      className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft font-display text-lg font-semibold text-primary"
                    >
                      {initials(name)}
                    </span>
                  )}
                </div>
                <span className="mt-3 line-clamp-2 text-center text-sm font-medium">{name}</span>
              </>
            );
            return (
              <li key={partner.id} className="w-[calc(50%-0.375rem)] min-w-0 sm:w-48">
                {partner.link_url ? (
                  <a
                    href={partner.link_url}
                    target={partner.link_url.startsWith("http") ? "_blank" : undefined}
                    rel={partner.link_url.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="group flex h-full min-h-36 flex-col items-center rounded-2xl border border-border/70 bg-card p-3 transition hover:-translate-y-1 hover:border-primary/35 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    aria-label={name}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="flex h-full min-h-36 flex-col items-center rounded-2xl border border-border/70 bg-card p-3">
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
