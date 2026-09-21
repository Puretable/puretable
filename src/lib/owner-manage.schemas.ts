import { z } from "zod";
import { BranchInput, LinkInput } from "./businesses.schemas";
import { extractUrl } from "./link-url";

/**
 * Validation for everything a business owner may change from the portal.
 *
 * Owners are untrusted, unlike admins, so unlike the admin schemas these:
 *  - list exactly which fields an owner may touch (no plan, slug, publish, verified, categories…);
 *  - accept only http(s) URLs and plain-text fields (no angle brackets: names end up in page
 *    metadata and structured-data scripts);
 *  - accept photo URLs only from this business's own upload folder (or values already saved).
 */

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export const MENU_SAFETY = ["green", "orange", "red"] as const;
export type MenuSafety = (typeof MENU_SAFETY)[number];
export const MAX_MENU_ITEMS = 200;
export const MAX_GALLERY_PHOTOS = 40;

const PLAIN = /^[^<>]*$/;
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const req = (max: number) =>
  z.string().trim().min(1).max(max).regex(PLAIN, "Angle brackets are not allowed");
const opt = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max).regex(PLAIN, "Angle brackets are not allowed").nullable().optional(),
  );

/** http(s) only. Pasted share text is cleaned to its URL first, like the admin link editor. */
export function toHttpUrl(value: string): string | null {
  const found = extractUrl(value);
  if (!found) return null;
  try {
    const url = new URL(found);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const httpUrl = (max = 2000) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(max)
      .transform((v, ctx) => {
        const url = toHttpUrl(v);
        if (!url) {
          ctx.addIssue({
            code: "custom",
            message: "الرابط غير صالح — الصق رابطاً يبدأ بـ https://",
          });
          return z.NEVER;
        }
        return url;
      })
      .nullable()
      .optional(),
  );

const phone = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^[+0-9 ()\-./]{5,40}$/, "رقم الهاتف غير صالح")
    .nullable()
    .optional(),
);
/** A WhatsApp number, or a link. */
const whatsapp = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300)
    .refine(
      (v) => /^[+0-9 ()-]{8,30}$/.test(v) || toHttpUrl(v) !== null,
      "رقم واتساب أو رابط غير صالح",
    )
    .nullable()
    .optional(),
);
/** An Instagram handle (with or without @) or a link. */
const instagram = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300)
    .refine(
      (v) => /^@?[A-Za-z0-9._]{1,30}$/.test(v) || toHttpUrl(v) !== null,
      "حساب إنستغرام غير صالح",
    )
    .nullable()
    .optional(),
);

const hours = z
  .record(z.string(), z.string().trim().max(60).regex(PLAIN))
  .refine(
    (h) => Object.keys(h).every((k) => (DAY_KEYS as readonly string[]).includes(k)),
    "Unknown day",
  );

/** Storage URL for uploads: `<project>/storage/v1/object/public/business-covers/owners/<id>/<file>`. */
export function ownerUploadPrefix(supabaseUrl: string, businessId: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/business-covers/owners/${businessId}/`;
}

/**
 * Photos must come from this business's own upload folder, or already be saved on the listing
 * (legacy photos added by an admin or an import stay untouched).
 */
export function assertAllowedPhotoUrls(
  urls: string[],
  ctx: { supabaseUrl: string; businessId: string; alreadySaved: string[] },
): void {
  const prefix = ownerUploadPrefix(ctx.supabaseUrl, ctx.businessId);
  const saved = new Set(ctx.alreadySaved);
  for (const url of urls) {
    const ok =
      saved.has(url) ||
      (url.startsWith(prefix) && url.length > prefix.length && !url.includes(".."));
    if (!ok) throw new Error("Photo must be uploaded through the portal");
  }
}

/** Fields an owner may edit on their listing. Everything else stays admin-only. */
export const OwnerBusinessInput = z.object({
  name: req(200),
  name_ar: opt(200),
  description: opt(5000),
  description_ar: opt(5000),
  products: opt(2000),
  products_ar: opt(2000),
  region: opt(100),
  city: req(100),
  city_ar: opt(100),
  district: opt(100),
  district_ar: opt(100),
  address: opt(300),
  address_ar: opt(300),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  phone,
  whatsapp,
  instagram,
  website: httpUrl(),
  maps_url: httpUrl(),
  hours,
  // `offers_booking` is deliberately absent: it is tied to admin-managed categories.
  discount_code: opt(80),
  no_location: z.boolean(),
  // Safety information is the owner's responsibility (the site already labels it "as reported
  // by the business"). Changing it clears the admin "verified" badge; see owner-manage.server.ts.
  safety: z.enum(["green", "red", "none"]),
  shared_kitchen: z.boolean(),
  dedicated_gf: z.boolean(),
  precautions_note: opt(500),
});
export type OwnerBusinessInput = z.infer<typeof OwnerBusinessInput>;

/** Photos are saved on their own so an unrelated invalid field can never block (or wipe) them. */
export const OwnerPhotosInput = z.object({
  cover_url: z.preprocess(emptyToNull, z.string().max(1000).nullable()),
  photos: z.array(z.string().max(1000)).max(MAX_GALLERY_PHOTOS),
});
export type OwnerPhotosInput = z.infer<typeof OwnerPhotosInput>;

/** Same shape as the admin branch form, minus anything that is not an owner's decision. */
export const OwnerBranchInput = BranchInput.omit({ plan_limited: true }).extend({
  name: req(120),
  name_ar: opt(120),
  address: opt(300),
  address_ar: opt(300),
  city: opt(100),
  city_ar: opt(100),
  district: opt(100),
  district_ar: opt(100),
  region: opt(100),
  phone,
  whatsapp,
  maps_url: httpUrl(),
  hours: hours.default({}),
  sort_order: z.number().int().min(0).max(10000).default(0),
});
export type OwnerBranchInput = z.infer<typeof OwnerBranchInput>;

export const OwnerLinkInput = LinkInput.extend({
  label: opt(80),
  product_name: opt(120),
  sort_order: z.number().int().min(0).max(10000).default(0),
});
export type OwnerLinkInput = z.infer<typeof OwnerLinkInput>;

export const MenuItemInput = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: req(120),
  name_ar: opt(120),
  // Optional: some items are priced by size or variety. Stored with two decimals, in SAR.
  price: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.number().min(0).max(100000).nullable(),
  ),
  photo_url: z.preprocess(emptyToNull, z.string().max(1000).nullable().optional()),
  safety: z.enum(MENU_SAFETY),
  sort_order: z.number().int().min(0).max(100000).default(0),
});
export type MenuItemInput = z.infer<typeof MenuItemInput>;

export type MenuItem = {
  id: string;
  business_id: string;
  name: string;
  name_ar: string | null;
  price: number | null;
  currency: string;
  photo_url: string | null;
  safety: MenuSafety;
  sort_order: number;
};

/** Which safety-related fields changed; any change withdraws the admin "verified" badge. */
export function safetyFieldsChanged(
  before: {
    safety?: string | null;
    shared_kitchen?: boolean | null;
    dedicated_gf?: boolean | null;
  },
  after: { safety: string; shared_kitchen: boolean; dedicated_gf: boolean },
): boolean {
  return (
    (before.safety ?? "red") !== after.safety ||
    !!before.shared_kitchen !== after.shared_kitchen ||
    !!before.dedicated_gf !== after.dedicated_gf
  );
}

/** Cover + gallery must fit the plan; a listing already over the limit may not grow. */
export function assertPhotoLimit(total: number, planLimit: number, currentTotal: number): void {
  if (total > Math.max(planLimit, currentTotal)) {
    throw new Error(`Photo limit reached (maximum ${planLimit})`);
  }
}

export type OwnerLinkRow = {
  id: string;
  business_id: string;
  branch_id: string | null;
  platform: string;
  url: string;
  label: string | null;
  product_name: string | null;
  sort_order: number;
};

export type OwnerBranchRow = z.input<typeof BranchInput> & { id: string };

/** Everything the portal loads for one business (the caller's own; RLS enforces that). */
export type OwnerBusinessDetail = {
  id: string;
  slug: string;
  plan: "free" | "pro" | "premium";
  published: boolean;
  verified: boolean;
  name: string;
  name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  products: string | null;
  products_ar: string | null;
  region: string | null;
  city: string;
  city_ar: string | null;
  district: string | null;
  district_ar: string | null;
  address: string | null;
  address_ar: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
  maps_url: string | null;
  hours: Record<string, string>;
  discount_code: string | null;
  no_location: boolean;
  safety: "green" | "red" | "none";
  shared_kitchen: boolean;
  dedicated_gf: boolean;
  precautions_note: string | null;
  cover_url: string | null;
  photos: string[];
  business_links: OwnerLinkRow[];
  business_branches: OwnerBranchRow[];
  business_menu_items: MenuItem[];
};
