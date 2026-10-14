import { MapPin, ArrowRight, Home as HomeIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { hasCategory, type Business } from "@/data/businesses";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { CoverImage } from "./CoverImage";
import { SafetyBadge, SharedKitchenBadge } from "./SafetyBadge";
import { FavoriteButton } from "./FavoriteButton";

export function BusinessCard({ b, distance = null }: { b: Business; distance?: number | null }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const name = b.name_i18n?.[lang] ?? b.name;
  const city = b.city_i18n?.[lang] ?? b.city;
  const products = b.products_i18n?.[lang] ?? b.products;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]">
      <Link
        to="/business/$id"
        params={{ id: b.id }}
        className="relative block aspect-[4/3] overflow-hidden bg-muted"
      >
        <CoverImage
          src={b.cover}
          alt={name}
          category={b.category}
          className="transition duration-500 group-hover:scale-105"
        />

        <span className="absolute top-3 flex flex-col items-start gap-1.5 ltr:left-3 rtl:right-3">
          <SafetyBadge level={b.safety ?? (b.dedicatedGf ? "green" : "red")} />
          {b.sharedKitchen ? <SharedKitchenBadge /> : null}
          {hasCategory(b, "home") && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
              <HomeIcon className="h-3 w-3" /> {t("filters.home_badge")}
            </span>
          )}
        </span>
      </Link>
      <FavoriteButton b={b} className="absolute top-3 z-10 ltr:right-3 rtl:left-3" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold leading-tight">
            <Link to="/business/$id" params={{ id: b.id }} className="hover:text-primary">
              {name}
            </Link>
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />{" "}
            {distance == null ? city : t("filters.km_away", { count: distance.toFixed(1) })}
          </span>
        </div>
        <p className="text-sm font-medium text-primary">{products}</p>

        <div className="mt-auto pt-2">
          <Link
            to="/business/$id"
            params={{ id: b.id }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {t("common.view_details")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </article>
  );
}
