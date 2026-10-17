import { readPlanCatalog } from "./subscriptions.server";
import { toFeatures } from "./subscriptions";
import { canUseMenu, planOf } from "./plans";
import { isPackagesEnabled } from "./packages-enabled.server";
import type { MenuItem } from "./owner-manage.schemas";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  mapDbBusiness,
  type Branch,
  type Business,
  type BusinessLink,
  type LinkPlatform,
  type OpeningHours,
} from "@/data/businesses";

export function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Public database configuration is unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

// Explicit allowlist for public reads of `businesses` — every column mapDbBusiness() needs, and
// nothing from the billing/invoice set (that's now business_billing, owner/admin-only). Never
// select("*") here: a future column added to `businesses` must be deliberately added to this list
// before it can reach a public response.
// Must exactly match the anon grant in supabase/migrations/20261015120000_fix_businesses_column_grants.sql
// (no needs_review/review_notes — admin-only moderation fields, not granted to anon).
export const PUBLIC_BUSINESS_COLUMNS =
  "id,slug,name,name_ar,category,categories,safety,region,city,cities,city_ar,district,district_ar,address,address_ar,lat,lng,phone,whatsapp,instagram,website,maps_url,cover_url,photos,description,description_ar,products,products_ar,hours,plan,offers_booking,discount_code,verified,dedicated_gf,shared_kitchen,precautions_note,no_location,published,created_at,updated_at,terms_accepted_at,terms_version,business_info_completed";

// Same as PUBLIC_BUSINESS_COLUMNS, plus the two internal moderation fields that only the
// `authenticated` role (owners, admins — anyone logged in) is granted, never anon. Any
// authenticated-context query against `businesses` (admin CRUD, owner self-service saves) must use
// this instead of select("*")/bare select() — those now fail outright for any role without a
// blanket table-level grant, which no longer exists on this table after the billing-column fix.
export const AUTHENTICATED_BUSINESS_COLUMNS = `${PUBLIC_BUSINESS_COLUMNS},needs_review,review_notes`;

// saveBusinessContact lives in business-contact.server.ts, not here: this file imports from
// @/data/businesses, which imports image assets directly — fine under Vite, but it breaks plain
// `tsx` execution (scripts/verify-owner-self-service.ts). Re-exported below for convenience.
export { saveBusinessContact } from "./business-contact.server";

function mapLink(link: Record<string, unknown>): BusinessLink {
  return {
    id: String(link.id),
    platform: link.platform as LinkPlatform,
    url: String(link.url),
    label: typeof link.label === "string" ? link.label : null,
    product_name: typeof link.product_name === "string" ? link.product_name : null,
    sort_order: typeof link.sort_order === "number" ? link.sort_order : 0,
    branch_id: typeof link.branch_id === "string" ? link.branch_id : null,
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

function mapBranch(row: Record<string, unknown>, links: BusinessLink[] = []): Branch {
  const h = (row.hours ?? {}) as Partial<OpeningHours>;
  const name = String(row.name ?? "");
  const address = str(row.address) ?? "";
  const city = str(row.city);
  const district = str(row.district);
  return {
    id: String(row.id),
    name,
    name_i18n: { en: name, ar: str(row.name_ar) ?? name },
    address,
    address_i18n: { en: address, ar: str(row.address_ar) ?? address },
    city,
    city_i18n: { en: city ?? "", ar: str(row.city_ar) ?? city ?? "" },
    district,
    district_i18n: district ? { en: district, ar: str(row.district_ar) ?? district } : undefined,
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    mapsUrl: str(row.maps_url),
    phone: str(row.phone),
    whatsapp: str(row.whatsapp),
    hours: {
      sun: h.sun ?? "",
      mon: h.mon ?? "",
      tue: h.tue ?? "",
      wed: h.wed ?? "",
      thu: h.thu ?? "",
      fri: h.fri ?? "",
      sat: h.sat ?? "",
    },
    permanentlyClosed: !!row.permanently_closed,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    links: links.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    pickupEnabled: !!row.pickup_enabled,
    deliveryEnabled: !!row.delivery_enabled,
    deliveryUrl: str(row.delivery_url),
    whatsappOrdersEnabled: !!row.whatsapp_orders_enabled,
  };
}

export async function fetchPublicBusinesses(): Promise<Business[]> {
  const client = publicClient();
  const [
    { data: rows, error: businessesError },
    { data: links, error: linksError },
    { data: branches, error: branchesError },
    catalog,
    packagesEnabled,
  ] = await Promise.all([
    client
      .from("businesses")
      .select(PUBLIC_BUSINESS_COLUMNS)
      .order("created_at", { ascending: true }),
    client.from("business_links").select("*"),
    client.from("business_branches").select("*").eq("published", true),
    readPlanCatalog(client),
    isPackagesEnabled(client),
  ]);
  if (businessesError) throw new Error(businessesError.message);
  if (linksError) throw new Error(linksError.message);
  if (branchesError) throw new Error(branchesError.message);
  // Links with a branch_id belong to that branch; the rest to the business itself.
  const byBusiness = new Map<string, BusinessLink[]>();
  const byBranch = new Map<string, BusinessLink[]>();
  for (const link of links ?? []) {
    const mapped = mapLink(link);
    if (mapped.branch_id) {
      byBranch.set(mapped.branch_id, [...(byBranch.get(mapped.branch_id) ?? []), mapped]);
    } else {
      byBusiness.set(link.business_id, [...(byBusiness.get(link.business_id) ?? []), mapped]);
    }
  }
  const branchesByBusiness = new Map<string, Branch[]>();
  for (const branch of branches ?? []) {
    const current = branchesByBusiness.get(branch.business_id) ?? [];
    current.push(mapBranch(branch, byBranch.get(branch.id) ?? []));
    branchesByBusiness.set(branch.business_id, current);
  }
  return (rows ?? []).map((row) => ({
    ...mapDbBusiness(
      row as never,
      byBusiness.get(row.id) ?? [],
      branchesByBusiness.get(row.id) ?? [],
    ),
    entitlements: packagesEnabled ? toFeatures(catalog[planOf(row)]) : toFeatures(catalog.premium),
  }));
}

export async function fetchPublicBusinessBySlug(slug: string): Promise<Business | null> {
  const client = publicClient();
  const { data: row, error } = await client
    .from("businesses")
    .select(PUBLIC_BUSINESS_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const [
    { data: links, error: linksError },
    { data: branches, error: branchesError },
    catalog,
    packagesEnabled,
  ] = await Promise.all([
    client.from("business_links").select("*").eq("business_id", row.id),
    client.from("business_branches").select("*").eq("business_id", row.id).eq("published", true),
    readPlanCatalog(client),
    isPackagesEnabled(client),
  ]);
  if (linksError) throw new Error(linksError.message);
  if (branchesError) throw new Error(branchesError.message);
  const menu = packagesEnabled && !canUseMenu(row) ? [] : await fetchPublicMenu(client, row.id);
  const mappedLinks = (links ?? []).map(mapLink);
  const business = mapDbBusiness(
    row as never,
    mappedLinks.filter((l) => !l.branch_id),
    (branches ?? []).map((b) =>
      mapBranch(
        b,
        mappedLinks.filter((l) => l.branch_id === b.id),
      ),
    ),
  );
  return {
    ...business,
    menu,
    entitlements: packagesEnabled ? toFeatures(catalog[planOf(row)]) : toFeatures(catalog.premium),
  };
}

/**
 * Gluten-free menu items, shown on Pro and Premium only. A failure here must never take the business page
 * down (for example while a deployment is ahead of its database migration), so it degrades to an
 * empty menu.
 */
async function fetchPublicMenu(client: SupabaseClient, businessId: string): Promise<MenuItem[]> {
  const { data, error } = await client
    .from("business_menu_items")
    .select(
      "id, business_id, name, name_ar, description, description_ar, price, currency, photo_url, safety, sort_order",
    )
    .eq("business_id", businessId)
    .order("sort_order")
    .order("created_at");
  if (error) {
    console.error("[menu] unavailable", error.message);
    return [];
  }
  return (data ?? []) as MenuItem[];
}

export async function assertAdmin(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
