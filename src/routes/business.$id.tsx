import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ogImageMeta } from "@/lib/seo";
import { useTranslation } from "react-i18next";
import { PublicMenu } from "@/components/site/MenuSection";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Phone,
  Instagram,
  Globe,
  Clock,
  ExternalLink,
  ArrowLeft,
  Utensils,
  Info,
  Building2,
  MessageCircle,
  CalendarCheck,
  Copy,
  Check,
} from "lucide-react";
import { Page } from "@/components/site/Layout";
import { usePageView } from "@/hooks/use-page-view";
import { useMemo, useState } from "react";
import { BranchesMap } from "@/components/site/BranchesMap";
import { distanceKm, hasCategory } from "@/data/businesses";
import { SERVICE_DEFS } from "@/lib/services";
import { useFilters } from "@/lib/filters";
import { SafetyNote } from "@/components/site/SafetyBadge";
import { FavoriteButton } from "@/components/site/FavoriteButton";
import { CoverImage } from "@/components/site/CoverImage";
import { goHref } from "@/lib/track";
import {
  instagramHref,
  pureTableWhatsAppMessage,
  whatsappHref,
  withPureTableUtm,
} from "@/lib/contact";
import { featuresOf, visibleDescription, visiblePhotos } from "@/lib/plans";

import { getBusinessBySlug } from "@/lib/businesses.public.functions";
import { useSiteText } from "@/hooks/use-site-settings";
import { actionGroupOf } from "@/lib/site-settings";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

import type { BusinessLink, LinkPlatform } from "@/data/businesses";

export const Route = createFileRoute("/business/$id")({
  loader: async ({ params, context }) => {
    const b = await context.queryClient.ensureQueryData({
      queryKey: ["business", params.id],
      queryFn: () => getBusinessBySlug({ data: { slug: params.id } }),
    });
    if (!b) throw notFound();
    return { business: b };
  },
  head: ({ params, loaderData }) => {
    const b = loaderData?.business;
    if (!b)
      return {
        meta: [{ title: "Not found — Pure Table" }, { name: "robots", content: "noindex" }],
      };
    const title = `${b.name} — Pure Table`;
    const url = `https://puretable.co/business/${params.id}`;
    const SCHEMA_TYPE: Record<string, string> = {
      restaurant: "Restaurant",
      cafe: "CafeOrCoffeeShop",
      bakery: "Bakery",
      dessert: "Bakery",
      supermarket: "GroceryStore",
      fine_dining: "Restaurant",
      delivery: "Restaurant",
      home: "FoodEstablishment",
    };
    const DAY: Record<string, string> = {
      sun: "Sunday",
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
    };
    const openingHours = b.noLocation
      ? undefined
      : Object.entries(b.hours ?? {})
          .filter(([d, v]) => DAY[d] && typeof v === "string" && v.trim())
          .map(([d, v]) => `${DAY[d]} ${v}`);
    return {
      meta: [
        { title },
        { name: "description", content: b.description },
        { property: "og:title", content: title },
        { property: "og:description", content: b.description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...ogImageMeta(b.cover),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": SCHEMA_TYPE[b.category] ?? "LocalBusiness",
            name: b.name,
            url,
            description: b.description || undefined,
            image: b.cover || undefined,
            servesCuisine: b.products || undefined,
            telephone: b.phone || undefined,
            ...(b.noLocation || !b.address
              ? {}
              : {
                  address: {
                    "@type": "PostalAddress",
                    streetAddress: b.address,
                    addressLocality: b.city,
                    addressCountry: "SA",
                  },
                  ...(b.lat && b.lng
                    ? { geo: { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } }
                    : {}),
                }),
            ...(openingHours?.length ? { openingHours } : {}),
          }),
        },
      ],
    };
  },
  component: BusinessDetail,
});

const PLATFORM_LABEL: Record<LinkPlatform, string> = {
  hungerstation: "HungerStation",
  jahez: "Jahez",
  thechefz: "The Chefz",
  toyou: "ToYou",
  keeta: "Keeta",
  requeue: "Requeue",
  mytable: "My Table",
  website: "Official Website",
  instagram: "Instagram",
  x: "X (Twitter)",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  email: "Email",
  maps: "Google Maps",
  phone: "Call Now",
};

function BusinessDetail() {
  const { business: initial } = Route.useLoaderData() as {
    business: NonNullable<Awaited<ReturnType<typeof getBusinessBySlug>>>;
  };
  const { id } = Route.useParams();
  const { data: b = initial } = useQuery({
    queryKey: ["business", id],
    queryFn: () => getBusinessBySlug({ data: { slug: id } }),
    initialData: initial,
  });
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { secondary: categoryFilters } = useFilters();
  // Site-wide order of the action boxes, editable from Appearance.
  const { layout: siteLayout } = useSiteText();
  const actionOrder = siteLayout.actions;

  usePageView({ business_slug: id, city: b?.city });
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [copiedDiscount, setCopiedDiscount] = useState(false);
  const [selectedMapPoint, setSelectedMapPoint] = useState<string | null>(null);
  const branchList = useMemo(() => b?.branches ?? [], [b?.branches]);
  const branches = useMemo(() => {
    if (!me) return branchList;
    return [...branchList].sort((x, y) => {
      const dx = x.lat && x.lng ? distanceKm(me, { lat: x.lat, lng: x.lng }) : Infinity;
      const dy = y.lat && y.lng ? distanceKm(me, { lat: y.lat, lng: y.lng }) : Infinity;
      return dx - dy;
    });
  }, [branchList, me]);
  if (!b) return null;

  const name = b.name_i18n?.[lang] ?? b.name;
  const city = b.city_i18n?.[lang] ?? b.city;
  const address = b.address_i18n?.[lang] ?? b.address;
  const products = b.products_i18n?.[lang] ?? b.products;
  const description = b.description_i18n?.[lang] ?? b.description;
  const categoryLabel =
    categoryFilters.find((category) => category.value === b.category)?.label ?? b.category;
  const whatsappMessage = pureTableWhatsAppMessage();
  const discountCode = b.discountCode;

  // Home businesses ("أسر منتجة") are shown without any Google Maps location —
  // only delivery links, social accounts and phone.
  // Home businesses ("أسر منتجة") are shown without any Google Maps location —
  // unless real branches were saved, the map always wins over the flag.
  const showLocation = branchList.length > 0 || (!b.noLocation && b.category !== "home");

  const hasCoords = showLocation && !!(b.lat && b.lng);
  const safetyLevel = b.safety ?? (b.dedicatedGf ? "green" : "red");
  // With several branches the button opens a Maps search for the brand, so every
  // location shows up at once instead of a single pin.
  const mapsUrl =
    branches.length > 1
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.city}`)}`
      : b.mapsUrl ||
        (hasCoords
          ? `https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${b.address || b.city}`)}`);

  // All map pins for this business: the main location plus every published branch.
  // Keep missing coordinates explicit; the map shows a notice instead of
  // guessing a location or contacting an external geocoding service.
  const mapPoints = showLocation
    ? [
        ...(branches.length === 0 || hasCoords
          ? [
              {
                id: "main",
                title: name,
                lat: b.lat ?? null,
                lng: b.lng ?? null,
                address,
                mapsUrl: b.mapsUrl ?? null,
                query: `${b.name} ${b.address || b.city}`,
              },
            ]
          : []),
        ...branches
          .filter((br) => !br.permanentlyClosed)
          .map((br) => ({
            id: br.id,
            title: br.name_i18n?.[lang] ?? br.name,
            lat: br.lat ?? null,
            lng: br.lng ?? null,
            address: br.address_i18n?.[lang] ?? br.address,
            mapsUrl: br.mapsUrl ?? null,
            query: `${b.name} ${br.address || br.name}`,
          })),
      ]
    : [];

  // Compose the full action-button list: DB links + implicit maps/phone/instagram.
  const implicit: BusinessLink[] = [];
  const savedLinks = b.links;
  const savedPlatforms = new Set(savedLinks.map((link) => link.platform));
  if (b.phone && !savedPlatforms.has("phone"))
    implicit.push({
      id: "phone",
      platform: "phone",
      url: `tel:${b.phone.replace(/\s/g, "")}`,
      sort_order: 90,
    });
  const waUrl = whatsappHref(b.whatsapp, whatsappMessage);
  if (waUrl && !savedPlatforms.has("whatsapp"))
    implicit.push({ id: "whatsapp", platform: "whatsapp", url: waUrl, sort_order: 88 });
  if (b.website && !savedPlatforms.has("website")) {
    implicit.push({ id: "website", platform: "website", url: b.website, sort_order: 85 });
  }
  if (b.instagram && !savedPlatforms.has("instagram")) {
    const igUrl = instagramHref(b.instagram);
    if (igUrl)
      implicit.push({ id: "instagram", platform: "instagram", url: igUrl, sort_order: 80 });
  }
  if (showLocation)
    implicit.push({
      id: "maps",
      platform: "maps",
      label: t("business.open_in_maps"),
      url: mapsUrl,
      sort_order: 70,
    });
  // Delivery apps are shown ONLY when the admin added a link for this business.
  const DELIVERY_PLATFORMS = new Set<LinkPlatform>([
    "hungerstation",
    "jahez",
    "thechefz",
    "toyou",
    "keeta",
  ]);
  // Display order of the action boxes is a site-wide setting the admin can
  // reorder from Appearance (call, WhatsApp, location, booking, delivery, …).
  const groupRank = (platform: string) => {
    const i = actionOrder.indexOf(actionGroupOf(platform));
    return i === -1 ? 99 : i;
  };
  // Package gating: the Free page keeps name, category, location, directions
  // and phone only. Delivery, booking, website, WhatsApp and menu/product links
  // belong to the paid packages.
  const plan = featuresOf(b);
  const FREE_PLATFORMS = new Set<string>(["maps", "phone", "instagram"]);
  const allLinks = [...savedLinks, ...implicit]
    .filter((l) => plan.showLinks || FREE_PLATFORMS.has(l.platform))
    .sort((x, y) => groupRank(x.platform) - groupRank(y.platform));
  const gallery = visiblePhotos(b).slice(1);

  // Branches shown as saved; closed ones stay visible but flagged. Customers can
  // sort by proximity to pick the nearest location.

  // Services this place offers (delivery / pickup / dine-in) — stored as
  // `svc_` tags on the business and shown as chips.
  const serviceTags = SERVICE_DEFS.filter((sv) => hasCategory(b, sv.value));

  const days = [
    { key: "sun", label: t("days.sun") },
    { key: "mon", label: t("days.mon") },
    { key: "tue", label: t("days.tue") },
    { key: "wed", label: t("days.wed") },
    { key: "thu", label: t("days.thu") },
    { key: "fri", label: t("days.fri") },
    { key: "sat", label: t("days.sat") },
  ] as const;

  // Every outbound link goes through the internal /go redirect so the click is
  // stored in Pure Table's own analytics before the visitor leaves.
  const EVENT_TYPE: Partial<Record<LinkPlatform, string>> = {
    maps: "click_maps",
    phone: "click_phone",
    website: "click_website",
    instagram: "click_social",
    x: "click_social",
    tiktok: "click_social",
    snapchat: "click_social",
    facebook: "click_social",
    whatsapp: "click_whatsapp",
    email: "click_social",
    requeue: "click_booking",
    mytable: "click_booking",
  };
  const trackedHref = (l: BusinessLink) => {
    const destination =
      l.platform === "website"
        ? withPureTableUtm(l.url)
        : l.platform === "whatsapp"
          ? whatsappHref(l.url, whatsappMessage) || l.url
          : l.url;
    return (
      // Instagram opens the account page directly — no internal redirect.
      l.platform === "instagram"
        ? destination
        : goHref({
            to: destination,
            type:
              EVENT_TYPE[l.platform] ??
              (DELIVERY_PLATFORMS.has(l.platform) ? "click_delivery" : "click_link"),
            business: b.id,
            linkId: l.id.length === 36 && l.id.includes("-") ? l.id : null,
            platform: l.platform,
            // product name only (never a translated label) so SSR and client match
            label: l.product_name || null,
          })
    );
  };

  async function copyDiscountCode() {
    if (!discountCode) return;
    try {
      await navigator.clipboard.writeText(discountCode);
      setCopiedDiscount(true);
      window.setTimeout(() => setCopiedDiscount(false), 1800);
    } catch {
      setCopiedDiscount(false);
    }
  }

  return (
    <Page>
      <section className="relative">
        <div className="relative h-64 w-full overflow-hidden sm:h-80 lg:h-96">
          <CoverImage src={b.cover} alt={name} category={b.category} imgClassName="p-2" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="mx-auto -mt-24 max-w-7xl px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[var(--shadow-soft)] hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" /> {t("common.back")}
          </Link>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] sm:p-10">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                  {categoryLabel}
                </span>
                <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">
                  {name}
                </h1>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" /> {city}
                </p>
              </div>
              <FavoriteButton b={b} className="h-11 w-11" />
            </div>

            <div className="mt-6 max-w-3xl">
              <SafetyNote
                level={safetyLevel}
                sharedKitchen={!!b.sharedKitchen}
                precautionsNote={b.precautionsNote}
              />
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                {products && (
                  <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 p-4">
                    <Utensils className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm text-foreground">{products}</p>
                  </div>
                )}

                {description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {visibleDescription(b, description)}
                  </p>
                )}

                <PublicMenu items={b.menu ?? []} lang={lang} />

                {gallery.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {gallery.map((src) => (
                      <div
                        key={src}
                        className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted"
                      >
                        <img
                          src={src}
                          alt={name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {serviceTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {serviceTags.map((sv) => (
                      <span
                        key={sv.value}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary"
                      >
                        <sv.icon className="h-3.5 w-3.5" /> {sv[lang]}
                      </span>
                    ))}
                  </div>
                )}

                {showLocation && address && (
                  <InfoBlock icon={MapPin} title={t("business.address")}>
                    <p className="text-sm text-foreground">{address}</p>
                  </InfoBlock>
                )}

                {/* Online-only / home businesses have no storefront, so opening hours are hidden too. */}
                {showLocation && (
                  <InfoBlock icon={Clock} title={t("business.hours")}>
                    <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
                      {days.map((d) => (
                        <li
                          key={d.key}
                          className="flex justify-between gap-4 rounded-lg bg-secondary/40 px-3 py-1.5"
                        >
                          <span className="font-medium text-foreground">{d.label}</span>
                          <span className="text-muted-foreground">{b.hours[d.key] || "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </InfoBlock>
                )}

                {branches.length > 0 && (
                  <InfoBlock
                    icon={Building2}
                    title={`${t("business.branches")} (${branches.length})`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        navigator.geolocation?.getCurrentPosition((pos) =>
                          setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        )
                      }
                      className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <MapPin className="h-3.5 w-3.5" /> {t("business.find_nearest")}
                    </button>
                    <div className="space-y-3">
                      {branches.map((br, brIndex) => {
                        const brName = br.name_i18n?.[lang] ?? br.name;
                        const brAddress = br.address_i18n?.[lang] ?? br.address;
                        const brMaps =
                          br.mapsUrl ||
                          (br.lat && br.lng
                            ? `https://www.google.com/maps/search/?api=1&query=${br.lat},${br.lng}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.name} ${brAddress || brName}`)}`);
                        const brHours = days.filter((d) => br.hours[d.key]);
                        return (
                          <div
                            key={br.id}
                            className="rounded-2xl border border-border bg-secondary/30 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                                {brIndex + 1}
                              </span>
                              <h3 className="font-display text-sm font-semibold">{brName}</h3>

                              {me && br.lat && br.lng && (
                                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                                  {distanceKm(me, { lat: br.lat, lng: br.lng }).toFixed(1)}{" "}
                                  {t("business.km_away")}
                                </span>
                              )}
                              {br.permanentlyClosed && (
                                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                                  {t("business.permanently_closed")}
                                </span>
                              )}
                            </div>
                            {brAddress && (
                              <p className="mt-1.5 flex items-start gap-1.5 text-sm text-muted-foreground">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {brAddress}
                              </p>
                            )}
                            {brHours.length > 0 && (
                              <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                                {brHours.map((d) => (
                                  <li
                                    key={d.key}
                                    className="flex justify-between gap-3 text-muted-foreground"
                                  >
                                    <span className="font-medium text-foreground">{d.label}</span>
                                    <span>{br.hours[d.key]}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              {br.phone && (
                                <a
                                  href={goHref({
                                    to: `tel:${br.phone.replace(/\s/g, "")}`,
                                    type: "click_phone",
                                    business: b.id,
                                    platform: "phone",
                                  })}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
                                >
                                  <Phone className="h-3.5 w-3.5" /> {br.phone}
                                </a>
                              )}
                              {plan.showLinks && whatsappHref(br.whatsapp, whatsappMessage) && (
                                <a
                                  href={goHref({
                                    to: whatsappHref(br.whatsapp, whatsappMessage)!,
                                    type: "click_whatsapp",
                                    business: b.id,
                                    platform: "whatsapp",
                                  })}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" /> {t("business.whatsapp")}
                                </a>
                              )}
                              <a
                                href={goHref({
                                  to: brMaps,
                                  type: "click_maps",
                                  business: b.id,
                                  platform: "maps",
                                })}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
                              >
                                <MapPin className="h-3.5 w-3.5" /> {t("business.open_in_maps")}
                              </a>
                              {/* Booking / delivery links saved for this branch only. */}
                              {(plan.showLinks ? (br.links ?? []) : []).map((l) => (
                                <a
                                  key={l.id}
                                  href={trackedHref(l)}
                                  target={l.platform === "phone" ? undefined : "_blank"}
                                  rel="noreferrer noopener"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                                >
                                  {l.label || PLATFORM_LABEL[l.platform]}
                                  <ExternalLink className="h-3 w-3 rtl:rotate-180" />
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* One shared map lives in the Location section below. */}
                  </InfoBlock>
                )}
              </div>

              <aside className="space-y-4">
                {b.discountCode && (
                  <div className="rounded-2xl border border-primary/30 bg-primary-soft p-5">
                    <p className="text-xs font-semibold text-primary">
                      {t("business.discount_label")}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-card px-4 py-3">
                      <code
                        dir="ltr"
                        className="truncate text-base font-bold tracking-wider text-foreground"
                      >
                        {b.discountCode}
                      </code>
                      <button
                        type="button"
                        onClick={copyDiscountCode}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        aria-label={t("business.copy_discount")}
                      >
                        {copiedDiscount ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedDiscount
                          ? t("business.discount_copied")
                          : t("business.copy_discount")}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("business.discount_note")}
                    </p>
                  </div>
                )}

                {allLinks.length > 0 && (
                  <div className="rounded-2xl border border-border bg-secondary/40 p-5">
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("business.contact_booking")}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">{t("business.order_note")}</p>
                    <div className="mt-4 space-y-2">
                      {allLinks.map((l) => (
                        <a
                          key={l.id}
                          href={trackedHref(l)}
                          target={l.platform === "phone" ? undefined : "_blank"}
                          rel="noreferrer noopener"
                          className="flex items-center justify-between gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                        >
                          <span className="flex items-center gap-2">
                            {l.platform === "phone" && <Phone className="h-4 w-4" />}
                            {l.platform === "instagram" && <Instagram className="h-4 w-4" />}
                            {l.platform === "maps" && <MapPin className="h-4 w-4" />}
                            {l.platform === "website" && <Globe className="h-4 w-4" />}
                            {l.platform === "whatsapp" && <MessageCircle className="h-4 w-4" />}
                            {(l.platform === "requeue" || l.platform === "mytable") && (
                              <CalendarCheck className="h-4 w-4" />
                            )}
                            {l.label || PLATFORM_LABEL[l.platform]}
                            {l.product_name ? (
                              <span className="opacity-80">— {l.product_name}</span>
                            ) : null}
                          </span>
                          <ExternalLink className="h-4 w-4 rtl:rotate-180" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      </section>

      {showLocation ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="font-display text-xl font-semibold">
            {t("business.location")}
            {mapPoints.length > 1 ? ` (${mapPoints.length})` : ""}
          </h2>
          {mapPoints.length > 0 ? (
            <div className="mt-4">
              {mapPoints.length > 1 && (
                <div
                  className="mb-3 flex gap-2 overflow-x-auto pb-1"
                  aria-label={t("business.map_locations")}
                >
                  {mapPoints.map((point) => (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => setSelectedMapPoint(point.id)}
                      aria-pressed={selectedMapPoint === point.id}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        selectedMapPoint === point.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/40 hover:text-primary"
                      }`}
                    >
                      {point.title}
                    </button>
                  ))}
                </div>
              )}
              <BranchesMap
                points={mapPoints}
                height={400}
                activePointId={selectedMapPoint}
                onPointSelect={setSelectedMapPoint}
              />
            </div>
          ) : null}
        </section>
      ) : b.noLocation ? (
        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
          <div className="flex gap-3 rounded-2xl border border-border bg-secondary/50 p-5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("business.no_location")}
            </p>
          </div>
        </section>
      ) : null}

      <section
        id="disclaimer"
        className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8 scroll-mt-24"
      >
        <div className="flex gap-3 rounded-2xl border border-border bg-secondary/50 p-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <h3 className="font-display text-sm font-semibold">{t("business.disclaimer_title")}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t("business.disclaimer")}
            </p>
          </div>
        </div>
      </section>
    </Page>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof MapPin;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="mt-3 ps-10">{children}</div>
    </div>
  );
}
