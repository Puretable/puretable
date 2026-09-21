import { useTranslation } from "react-i18next";
import { Utensils } from "lucide-react";
import { MENU_SAFETY_STYLE, formatMenuPrice } from "@/lib/menu-safety";
import type { MenuItem, MenuSafety } from "@/lib/owner-manage.schemas";

export function MenuSafetyBadge({ level }: { level: MenuSafety }) {
  const { t } = useTranslation();
  const style = MENU_SAFETY_STYLE[level];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] font-medium ${style.border} ${style.text}`}
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
      {t(style.labelKey)}
    </span>
  );
}

/** Public gluten-free menu on the business page. Shown on every plan. */
export function PublicMenu({ items, lang }: { items: MenuItem[]; lang: string }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <section aria-labelledby="gf-menu-title" className="space-y-3">
      <h2 id="gf-menu-title" className="flex items-center gap-2 font-display text-lg font-semibold">
        <Utensils className="h-4 w-4 text-primary" />
        {t("business.gf_menu")}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const name = lang === "ar" ? item.name_ar || item.name : item.name;
          const price = formatMenuPrice(item, lang);
          return (
            <li key={item.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
              {item.photo_url && (
                <img
                  src={item.photo_url}
                  alt={name}
                  loading="lazy"
                  className="h-20 w-20 shrink-0 rounded-xl border border-border bg-muted object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="break-words text-sm font-medium">{name}</h3>
                  {price && (
                    <span className="shrink-0 text-sm font-semibold text-primary">{price}</span>
                  )}
                </div>
                <MenuSafetyBadge level={item.safety} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t("business.gf_menu_note")}</p>
    </section>
  );
}
