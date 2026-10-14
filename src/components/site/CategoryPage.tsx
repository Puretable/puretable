import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarCheck,
  Home as HomeIcon,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Page } from "./Layout";
import { BusinessCard } from "./BusinessCard";
import { BusinessMap } from "./BusinessMap";
import { LocationFallbackDialog } from "./LocationFallbackDialog";
import type { Business } from "@/data/businesses";
import { hasCategory } from "@/data/businesses";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { usePageView } from "@/hooks/use-page-view";
import { track, trackImpressions } from "@/lib/track";
import {
  buildLocationOptions,
  discoverBusinesses,
  NEARBY_RADIUS_KM,
  type Coordinates,
} from "@/lib/discovery";
import { LocationRequestError, requestBrowserLocation } from "@/lib/geolocation";
import { useFilters } from "@/lib/filters";

type View = "list" | "map";

export function CategoryPage({
  eyebrow,
  title,
  description,
  items,
  initialQuery = "",
  initialPremiumOnly = false,
  initialBookingOnly = false,
  requestNearbyOnMount = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  items: Business[];
  initialQuery?: string;
  initialPremiumOnly?: boolean;
  initialBookingOnly?: boolean;
  requestNearbyOnMount?: boolean;
}) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { secondary: filterEntries } = useFilters();
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [premiumOnly, setPremiumOnly] = useState(initialPremiumOnly);
  const [bookingOnly, setBookingOnly] = useState(initialBookingOnly);
  const [homeOnly, setHomeOnly] = useState(false);
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [manualCity, setManualCity] = useState<string | null>(null);
  const [manualDistrict, setManualDistrict] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const requestedOnMount = useRef(false);

  usePageView({ city: manualCity ?? undefined, search_query: deferredQuery || undefined });

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  useEffect(() => setPremiumOnly(initialPremiumOnly), [initialPremiumOnly]);
  useEffect(() => setBookingOnly(initialBookingOnly), [initialBookingOnly]);

  const locationOptions = useMemo(() => buildLocationOptions(items, lang), [items, lang]);
  const availableCategories = useMemo(
    () =>
      filterEntries.filter((entry) => items.some((business) => hasCategory(business, entry.value))),
    [filterEntries, items],
  );

  const requestNearby = useCallback(async () => {
    track({ event_type: "filter_click", platform: "main", label: "near_me" });
    setLocating(true);
    setLocationError(null);
    try {
      const nextPosition = await requestBrowserLocation();
      setPosition(nextPosition);
      setManualCity(null);
      setManualDistrict(null);
    } catch (error) {
      const reason = error instanceof LocationRequestError ? error.reason : "unavailable";
      setLocationError(t(`filters.location_${reason}`));
      setFallbackOpen(true);
    } finally {
      setLocating(false);
    }
  }, [t]);

  useEffect(() => {
    if (!requestNearbyOnMount || requestedOnMount.current) return;
    requestedOnMount.current = true;
    void requestNearby();
  }, [requestNearby, requestNearbyOnMount]);

  const results = useMemo(() => {
    const base = discoverBusinesses(items, {
      query: deferredQuery,
      categories: selectedCategories,
      premiumOnly,
      bookingOnly,
      position,
      nearbyOnly: !!position,
      cityKey: manualCity,
      districtKey: manualDistrict,
    });
    return homeOnly ? base.filter((result) => hasCategory(result.business, "home")) : base;
  }, [
    bookingOnly,
    deferredQuery,
    homeOnly,
    items,
    manualCity,
    manualDistrict,
    position,
    premiumOnly,
    selectedCategories,
  ]);
  const filtered = useMemo(() => results.map((result) => result.business), [results]);

  useEffect(() => {
    trackImpressions(filtered.map((business) => business.id));
  }, [filtered]);

  const manualCityLabel = locationOptions.find((option) => option.key === manualCity)?.label;
  const manualDistrictLabel = locationOptions
    .find((option) => option.key === manualCity)
    ?.districts.find((district) => district.key === manualDistrict)?.label;
  const locationActive = !!position || !!manualCity;
  const activeCount =
    selectedCategories.length +
    Number(premiumOnly) +
    Number(bookingOnly) +
    Number(homeOnly) +
    Number(locationActive);

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition ${
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-primary"
    }`;

  const clearFilters = () => {
    setSelectedCategories([]);
    setPremiumOnly(false);
    setBookingOnly(false);
    setHomeOnly(false);
    setPosition(null);
    setManualCity(null);
    setManualDistrict(null);
    setLocationError(null);
  };

  return (
    <Page>
      <section className="border-b border-border/60 bg-[var(--gradient-hero)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{description}</p>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8"
        aria-label={t("filters.title")}
      >
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">{t("home.search")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("home.search_placeholder")}
              className="w-full bg-transparent py-3 text-sm outline-none"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPremiumOnly((value) => !value)}
              className={chip(premiumOnly)}
              aria-pressed={premiumOnly}
            >
              <Sparkles className="h-3.5 w-3.5" /> {t("home.q_featured")}
            </button>
            <button
              type="button"
              onClick={() => setBookingOnly((value) => !value)}
              className={chip(bookingOnly)}
              aria-pressed={bookingOnly}
            >
              <CalendarCheck className="h-3.5 w-3.5" /> {t("home.q_book")}
            </button>
            <button
              type="button"
              onClick={() => void requestNearby()}
              disabled={locating}
              className={chip(!!position)}
              aria-pressed={!!position}
            >
              {locating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MapPin className="h-3.5 w-3.5" />
              )}
              {locating ? t("filters.locating") : t("home.q_near")}
            </button>
            <button
              type="button"
              onClick={() => setFallbackOpen(true)}
              className={chip(!!manualCity)}
              aria-pressed={!!manualCity}
            >
              <MapPin className="h-3.5 w-3.5" />
              {manualCityLabel
                ? [manualCityLabel, manualDistrictLabel].filter(Boolean).join(" — ")
                : t("filters.choose_manually")}
            </button>
            <button
              type="button"
              onClick={() => setHomeOnly((value) => !value)}
              className={chip(homeOnly)}
              aria-pressed={homeOnly}
            >
              <HomeIcon className="h-3.5 w-3.5" /> {t("filters.home_only")}
            </button>
          </div>

          {availableCategories.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
              {availableCategories.map((entry) => {
                const active = selectedCategories.includes(entry.value);
                return (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() =>
                      setSelectedCategories((current) =>
                        current.includes(entry.value)
                          ? current.filter((value) => value !== entry.value)
                          : [...current, entry.value],
                      )
                    }
                    className={chip(active)}
                    aria-pressed={active}
                  >
                    <entry.icon className="h-3.5 w-3.5" /> {entry.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {t("filters.results_count", { count: results.length })}
              {position ? ` · ${t("filters.within_km", { count: NEARBY_RADIUS_KM })}` : ""}
            </p>
            {activeCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <X className="h-3.5 w-3.5" /> {t("filters.clear_all")}
              </button>
            ) : null}
          </div>
          {locationError ? (
            <p className="mt-2 text-xs text-destructive" role="status">
              {locationError}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-end">
          <div className="inline-flex items-center rounded-full border border-border bg-card p-1 shadow-[var(--shadow-soft)]">
            <button
              type="button"
              onClick={() => setView("list")}
              className={chip(view === "list")}
              aria-pressed={view === "list"}
            >
              <List className="h-3.5 w-3.5" /> {t("filters.list_view")}
            </button>
            <button
              type="button"
              onClick={() => setView("map")}
              className={chip(view === "map")}
              aria-pressed={view === "map"}
            >
              <MapIcon className="h-3.5 w-3.5" /> {t("filters.map_view")}
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            {t("filters.no_results")}
          </p>
        ) : view === "map" ? (
          <BusinessMap items={filtered} />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map(({ business, distance }) => (
              <BusinessCard key={business.id} b={business} distance={distance} />
            ))}
          </div>
        )}
      </section>

      <LocationFallbackDialog
        open={fallbackOpen}
        onOpenChange={setFallbackOpen}
        options={locationOptions}
        onApply={(city, district) => {
          setPosition(null);
          setManualCity(city);
          setManualDistrict(district);
          setLocationError(null);
          track({
            event_type: "filter_click",
            platform: "manual_location",
            label: district ?? city,
          });
        }}
      />
    </Page>
  );
}
