import restaurantImg from "@/assets/restaurant.jpg";
import type { MenuItem } from "@/lib/owner-manage.schemas";
import cafeImg from "@/assets/cafe.jpg";
import bakeryImg from "@/assets/bakery.jpg";
import homeImg from "@/assets/home-business.jpg";
import dessertImg from "@/assets/dessert.jpg";
import { regionForCity } from "@/lib/saudi";
import { planOf, type PlanFeatures } from "@/lib/plans";

export type Category =
  | "restaurant"
  | "cafe"
  | "bakery"
  | "dessert"
  | "home"
  | "supermarket"
  | "fine_dining"
  | "delivery";
/** green = dedicated GF kitchen, red = confirm with staff, none = hide the dot entirely. */
export type SafetyLevel = "green" | "red" | "none";
type I18nString = { en: string; ar: string };

export const LINK_PLATFORMS = [
  "hungerstation",
  "jahez",
  "thechefz",
  "toyou",
  "keeta",
  "requeue",
  "mytable",
  "website",
  "instagram",
  "x",
  "tiktok",
  "snapchat",
  "facebook",
  "whatsapp",
  "email",
  "maps",
  "phone",
] as const;

export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

/** Table-booking apps — shown in the actions box next to call / maps. */
export const BOOKING_PLATFORMS: LinkPlatform[] = ["requeue", "mytable"];

export type BusinessLink = {
  id: string;
  platform: LinkPlatform;
  url: string;
  label?: string | null;
  product_name?: string | null;
  sort_order?: number;
  branch_id?: string | null;
};

export type OpeningHours = {
  sun: string;
  mon: string;
  tue: string;
  wed: string;
  thu: string;
  fri: string;
  sat: string;
};

export type Branch = {
  id: string;
  name: string;
  name_i18n?: I18nString;
  address: string;
  address_i18n?: I18nString;
  city?: string | null;
  city_i18n?: I18nString;
  district?: string | null;
  district_i18n?: I18nString;
  lat: number | null;
  lng: number | null;
  mapsUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  hours: OpeningHours;
  permanentlyClosed?: boolean;
  sort_order?: number;
  /** Booking / delivery links attached to this branch only. */
  links?: BusinessLink[];
};

/** Manual subscription tier — set by an admin only, no online payments. */
export type { PlanTier } from "@/lib/plans";
import type { PlanTier } from "@/lib/plans";

export type Business = {
  /** Resolved by the server from the current shared plan definition. */
  entitlements?: PlanFeatures;
  id: string; // slug — used in URLs
  dbId?: string; // uuid
  plan?: PlanTier;
  name: string;
  name_i18n?: I18nString;
  category: Category;
  categories?: Category[];
  safety?: SafetyLevel;
  /** Shared kitchen (orange dot) + the editable precautions note. */
  sharedKitchen?: boolean;
  precautionsNote?: string | null;
  city: string;
  /** Extra cities this business also serves / has locations in. */
  cities?: string[];
  city_i18n?: I18nString;
  district?: string | null;
  district_i18n?: I18nString;
  region?: string | null;
  cover: string;
  /** Extra gallery photos (cover excluded), capped per plan when displayed. */
  photos?: string[];

  products: string;
  products_i18n?: I18nString;
  description: string;
  description_i18n?: I18nString;
  address: string;
  address_i18n?: I18nString;
  lat: number | null;
  lng: number | null;
  phone: string;
  whatsapp?: string | null;
  instagram?: string;
  website?: string;
  mapsUrl?: string;
  hours: OpeningHours;
  verified?: boolean;
  dedicatedGf?: boolean;
  noLocation?: boolean;
  offersBooking?: boolean;
  discountCode?: string | null;
  createdAt?: string;
  links: BusinessLink[];
  branches: Branch[];
  /** Gluten-free menu items (any plan). Loaded on the business page only. */
  menu?: MenuItem[];
};

export const CATEGORY_COVER: Record<Category, string> = {
  restaurant: restaurantImg,
  cafe: cafeImg,
  bakery: bakeryImg,
  dessert: dessertImg,
  home: homeImg,
  supermarket: cafeImg,
  fine_dining: restaurantImg,
  delivery: restaurantImg,
};

export const CITIES = ["Riyadh", "Jeddah", "Dammam", "Khobar"] as const;
export type City = (typeof CITIES)[number];

/**
 * Every Google Maps place type we may receive, folded onto one of our
 * categories. Anything not listed here still falls back to the keyword rules
 * below, so a brand new Google type never blocks a save.
 */
const GOOGLE_TYPE_CATEGORY: Record<string, Category> = {
  fine_dining_restaurant: "restaurant",
  meal_delivery: "restaurant",
  meal_takeaway: "restaurant",
  bakery: "bakery",
  bagel_shop: "bakery",
  donut_shop: "bakery",
  cafe: "cafe",

  coffee_shop: "cafe",
  tea_house: "cafe",
  juice_shop: "cafe",
  cat_cafe: "cafe",
  dog_cafe: "cafe",
  internet_cafe: "cafe",
  dessert_shop: "dessert",
  dessert_restaurant: "dessert",
  ice_cream_shop: "dessert",
  chocolate_shop: "dessert",
  candy_store: "dessert",
  confectionery: "dessert",
  supermarket: "supermarket",
  grocery_store: "supermarket",
  convenience_store: "supermarket",
  food_store: "supermarket",
  asian_grocery_store: "supermarket",
  butcher_shop: "supermarket",
  market: "supermarket",
  wholesaler: "supermarket",
  department_store: "supermarket",
  discount_store: "supermarket",
  warehouse_store: "supermarket",
  catering_service: "home",
  food_delivery: "restaurant",
};

/**
 * Category values can arrive from imports, spreadsheets, Google Maps place
 * types or manual entry in several spellings (English, Arabic, plural).
 * Everything is folded back to a canonical category so listing pages never
 * silently drop a business and the database never rejects a save.
 */
export function normalizeCategory(raw: string | null | undefined): Category {
  const c = (raw ?? "").toString().toLowerCase().trim();
  if (!c) return "restaurant";
  // Filters created by an admin are stored as `cf_<slug>` and the main
  // service tags as `svc_<name>`; both pass through untouched.
  if (/^cf_[a-z0-9-]+$/.test(c) || /^svc_[a-z_]+$/.test(c)) return c as Category;
  // "Fine dining" and "Delivery" are no longer separate filters — those
  // businesses stay in the directory under Restaurants.
  if (c === "fine_dining" || c === "delivery") return "restaurant";

  const googleKey = c.replace(/[\s-]+/g, "_");
  if (GOOGLE_TYPE_CATEGORY[googleKey]) return GOOGLE_TYPE_CATEGORY[googleKey]!;
  if (c.startsWith("fine") || c.includes("فاين") || c.includes("راقي") || c.includes("فخم"))
    return "restaurant";
  if (c.startsWith("deliver") || c.includes("توصيل") || c.includes("طلبات")) return "restaurant";
  if (
    c.startsWith("cafe") ||
    c.startsWith("coffee") ||
    c.includes("قهوة") ||
    c.includes("كافيه") ||
    c.includes("مقهى") ||
    c.includes("مقاهي")
  )
    return "cafe";
  if (c.startsWith("bak") || c.includes("مخبز") || c.includes("مخابز") || c.includes("فرن"))
    return "bakery";
  if (
    c.startsWith("dessert") ||
    c.startsWith("sweet") ||
    c.includes("حلوي") ||
    c.includes("حلا") ||
    c.includes("حلويات")
  )
    return "dessert";
  if (
    c.startsWith("home") ||
    c.includes("منزل") ||
    c.includes("منزلي") ||
    c.includes("اسرة منتجة") ||
    c.includes("أسرة منتجة") ||
    c.includes("أسر منتجة") ||
    c.includes("اسر منتجة") ||
    c.includes("منتجة") ||
    c.includes("بيتي")
  )
    return "home";
  if (
    c.startsWith("super") ||
    c.startsWith("grocer") ||
    c.startsWith("market") ||
    c.startsWith("store") ||
    c.includes("سوبر") ||
    c.includes("ماركت") ||
    c.includes("بقالة") ||
    c.includes("بقاله") ||
    c.includes("تموين") ||
    c.includes("متجر") ||
    c.includes("هايبر")
  )
    return "supermarket";
  if (c.startsWith("rest") || c.includes("مطعم") || c.includes("مطاعم")) return "restaurant";
  return "restaurant";
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Map a raw DB row (+ links) to the display shape used by existing components.
export function mapDbBusiness(
  row: {
    id: string;
    slug: string;
    name: string;
    name_ar: string | null;
    category: string;
    categories?: string[] | null;
    safety?: string | null;
    city: string;
    cities?: string[] | null;
    city_ar: string | null;
    district?: string | null;
    district_ar?: string | null;
    address: string | null;
    address_ar: string | null;
    lat: number | null;
    lng: number | null;
    phone: string | null;
    whatsapp?: string | null;
    shared_kitchen?: boolean | null;
    precautions_note?: string | null;
    instagram: string | null;
    website: string | null;
    maps_url?: string | null;
    cover_url: string | null;
    description: string | null;
    description_ar: string | null;
    products: string | null;
    products_ar: string | null;
    hours: unknown;
    verified: boolean;
    dedicated_gf?: boolean | null;
    no_location?: boolean | null;
    region?: string | null;
    plan?: string | null;
    offers_booking?: boolean | null;
    discount_code?: string | null;
    created_at?: string | null;
    photos?: string[] | null;
  },
  links: BusinessLink[] = [],
  branches: Branch[] = [],
): Business {
  const category = normalizeCategory(row.category);
  // A business can be tagged with several filters; the primary one is always included.
  const categories = Array.from(
    new Set([category, ...(row.categories ?? []).map((c) => normalizeCategory(c))]),
  );
  const safety: SafetyLevel =
    row.safety === "green" || row.safety === "none" || row.safety === "red"
      ? row.safety
      : row.dedicated_gf
        ? "green"
        : "red";
  // Only a real uploaded/official image is used — no stock storefront fallback.
  const cover = row.cover_url ?? "";

  const h = (row.hours ?? {}) as Partial<OpeningHours>;
  const hours: OpeningHours = {
    sun: h.sun ?? "",
    mon: h.mon ?? "",
    tue: h.tue ?? "",
    wed: h.wed ?? "",
    thu: h.thu ?? "",
    fri: h.fri ?? "",
    sat: h.sat ?? "",
  };
  // NOTE: `||` (not `??`) on every localized field — an empty Arabic value saved
  // from the admin form must fall back to the main value, otherwise the Arabic
  // site would render a business with a blank name.
  return {
    id: row.slug,
    dbId: row.id,
    plan: planOf(row),
    name: row.name,
    // The name typed in the admin is the only name shown to visitors.
    name_i18n: { en: row.name, ar: row.name },
    category,
    categories,
    safety,
    sharedKitchen: !!row.shared_kitchen,
    precautionsNote: row.precautions_note ?? null,
    city: row.city,
    cities: Array.from(new Set([row.city, ...(row.cities ?? [])].filter(Boolean))),
    city_i18n: { en: row.city, ar: row.city_ar || row.city },
    district: row.district ?? null,
    district_i18n: row.district
      ? { en: row.district, ar: row.district_ar || row.district }
      : undefined,
    region: row.region ?? regionForCity(row.city) ?? regionForCity(row.city_ar),
    cover,
    photos: (row.photos ?? []).filter((p): p is string => !!p),
    products: row.products ?? "",
    products_i18n: { en: row.products ?? "", ar: row.products_ar || row.products || "" },
    description: row.description ?? "",
    description_i18n: {
      en: row.description ?? "",
      ar: row.description_ar || row.description || "",
    },
    address: row.address ?? "",
    address_i18n: { en: row.address ?? "", ar: row.address_ar || row.address || "" },
    lat: row.lat,
    lng: row.lng,
    phone: row.phone ?? "",
    whatsapp: row.whatsapp ?? null,
    instagram: row.instagram ?? undefined,
    website: row.website ?? undefined,
    mapsUrl: row.maps_url ?? undefined,
    hours,
    verified: row.verified,
    dedicatedGf: !!row.dedicated_gf,
    noLocation: !!row.no_location,
    offersBooking: !!row.offers_booking,
    discountCode: row.discount_code?.trim() || null,
    createdAt: row.created_at ?? undefined,
    links: links.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    branches: branches.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  };
}

/** True when a business is tagged with this filter (primary or additional). */
export function hasCategory(b: Business, cat: string) {
  return (b.categories?.length ? (b.categories as string[]) : [b.category as string]).includes(cat);
}
