/**
 * Main categories = the four ways a visitor can use a place
 * (book a table / delivery / pickup). They are stored inside the same
 * `categories` array on a business, prefixed with `svc_` so they never clash
 * with the type categories (restaurant, cafe, …) and never become the primary
 * `category` column, which the database restricts to type values.
 *
 * "Near me" is location based, so it has no tag.
 */
import { CalendarCheck, Bike, ShoppingBag, type LucideIcon } from "lucide-react";
import { featuresOf, type PlanAccess } from "@/lib/plans";

export type ServiceDef = {
  value: string;
  /** URL slug — the page lives at /s/<slug>. */
  slug: string;
  ar: string;
  en: string;
  icon: LucideIcon;
};

export const SERVICE_DEFS: ServiceDef[] = [
  {
    value: "svc_dine_in",
    slug: "dine-in",
    ar: "احجز طاولتك",
    en: "Book a table",
    icon: CalendarCheck,
  },
  { value: "svc_delivery", slug: "delivery", ar: "توصيل", en: "Delivery", icon: Bike },
  { value: "svc_pickup", slug: "pickup", ar: "استلم من المطعم", en: "Pickup", icon: ShoppingBag },
];

export const SERVICE_VALUES = SERVICE_DEFS.map((s) => s.value);

export function isServiceValue(v: string) {
  return v.startsWith("svc_");
}

export function serviceBySlug(slug: string) {
  return SERVICE_DEFS.find((s) => s.slug === slug);
}

/**
 * "Featured places" is automatic: a business appears there while its effective
 * plan (after any platform-wide override) is Premium. Nothing to tick in the editor.
 */
export function isFeatured(b: PlanAccess) {
  return featuresOf(b).featured;
}

/** Controlled by the admin toggle, regardless of the eventual booking method. */
export function canBook(b: { offersBooking?: boolean }) {
  return !!b.offersBooking;
}
