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
      className="mx-auto mt-20 w-full max-w-5xl px-4 sm:px-6 lg:px-8"
    >
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
      <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
        {data.map((partner) => {
          const name = lang === "ar" ? partner.name_ar || partner.name : partner.name;
          const content = partner.logo_url ? (
            <img
              src={partner.logo_url}
              alt={name}
              loading="lazy"
              width={160}
              height={64}
              className="h-14 w-auto max-w-[9rem] object-contain opacity-90 transition duration-300 group-hover:opacity-100 group-hover:scale-[1.04]"
            />
          ) : (
            <span
              aria-label={name}
              className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft font-display text-lg font-semibold text-primary"
            >
              {initials(name)}
            </span>
          );
          return (
            <li key={partner.id} className="flex items-center justify-center">
              {partner.link_url ? (
                <a
                  href={partner.link_url}
                  target={partner.link_url.startsWith("http") ? "_blank" : undefined}
                  rel={partner.link_url.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="group inline-flex items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  aria-label={name}
                >
                  {content}
                </a>
              ) : (
                <span className="inline-flex items-center justify-center" aria-label={name}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
