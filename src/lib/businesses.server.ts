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
// lat/lng are deliberately NOT here: anon no longer has a column grant for them (see
// supabase/test-sync/20261021_branch_location_privacy_and_sync.sql) — they're fetched separately
// via public_business_coordinates()/public_branch_coordinates(), which null them out for
// home-category businesses. This is the actual privacy boundary, not just a UI choice.
// terms_accepted_at/terms_version are deliberately NOT here either: they're the owner's private
// agreement record, mapDbBusiness() never reads them for a public response, and the MCP
// get_gluten_free_place tool spreads this exact select() straight into its public JSON — see
// supabase/test-sync/20261022_agreement_columns_anon_privacy.sql for the matching anon column-grant
// revoke.
export const PUBLIC_BUSINESS_COLUMNS =
  "id,slug,name,name_ar,category,categories,safety,region,city,cities,city_ar,district,district_ar,address,address_ar,phone,whatsapp,instagram,website,maps_url,cover_url,photos,description,description_ar,products,products_ar,hours,plan,offers_booking,discount_code,verified,dedicated_gf,shared_kitchen,precautions_note,no_location,published,created_at,updated_at,business_info_completed";

// Same as PUBLIC_BUSINESS_COLUMNS, plus lat/lng, terms_accepted_at/terms_version (the owner's own
// agreement status — needed by the owner portal's agreement gate and by admin), and the two internal
// moderation fields that only the `authenticated` role (owners, admins — anyone logged in) is
// granted, never anon. Any authenticated-context query against `businesses` (admin CRUD, owner
// self-service saves) must use this instead of select("*")/bare select() — those now fail outright
// for any role without a blanket table-level grant, which no longer exists on this table after the
// billing-column fix.
export const AUTHENTICATED_BUSINESS_COLUMNS = `${PUBLIC_BUSINESS_COLUMNS},lat,lng,needs_review,review_notes,terms_accepted_at,terms_version`;

// Explicit allowlist for public (anon) reads of `business_branches` — lat/lng excluded for the same
// reason as above; fetched separately and redacted for home businesses.
const PUBLIC_BRANCH_COLUMNS =
  "id,business_id,place_id,name,name_ar,address,address_ar,city,city_ar,district,district_ar,region,maps_url,phone,whatsapp,hours,sort_order,permanently_closed,published,plan_limited,pickup_enabled,delivery_enabled,delivery_url,whatsapp_orders_enabled,created_at,updated_at";

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

type BusinessCoordRow = { business_id: string; lat: number | null; lng: number | null };
type BranchCoordRow = { branch_id: string; lat: number | null; lng: number | null };

function mapBranch(
  row: Record<string, unknown>,
  links: BusinessLink[] = [],
  coords?: { lat: number | null; lng: number | null },
): Branch {
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
    // Not selected directly for anon (see PUBLIC_BRANCH_COLUMNS) — passed in separately from
    // public_branch_coordinates(), which nulls them out for home-category businesses.
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
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
    { data: launchPartners, error: launchPartnersError },
    { data: businessCoords, error: businessCoordsError },
    { data: branchCoords, error: branchCoordsError },
    catalog,
    packagesEnabled,
  ] = await Promise.all([
    client
      .from("businesses")
      .select(PUBLIC_BUSINESS_COLUMNS)
      .order("created_at", { ascending: true }),
    client.from("business_links").select("*"),
    client.from("business_branches").select(PUBLIC_BRANCH_COLUMNS).eq("published", true),
    client.from("success_partners").select("business_id").eq("kind", "business").eq("active", true),
    client.rpc("public_business_coordinates") as unknown as Promise<{
      data: BusinessCoordRow[] | null;
      error: { message: string } | null;
    }>,
    client.rpc("public_branch_coordinates") as unknown as Promise<{
      data: BranchCoordRow[] | null;
      error: { message: string } | null;
    }>,
    readPlanCatalog(client),
    isPackagesEnabled(client),
  ]);
  if (businessesError) throw new Error(businessesError.message);
  if (linksError) throw new Error(linksError.message);
  if (branchesError) throw new Error(branchesError.message);
  if (launchPartnersError) throw new Error(launchPartnersError.message);
  if (businessCoordsError) throw new Error(businessCoordsError.message);
  if (branchCoordsError) throw new Error(branchCoordsError.message);
  const launchPartnerIds = new Set(
    (launchPartners ?? []).map((p) => p.business_id as string).filter(Boolean),
  );
  // Coordinates, pre-redacted server-side for home businesses (see public_business_coordinates()/
  // public_branch_coordinates() in supabase/test-sync/20261021_branch_location_privacy_and_sync.sql)
  // — never read lat/lng off the raw business/branch rows for a public response.
  const businessCoordsById = new Map(
    (businessCoords ?? []).map((c) => [c.business_id, { lat: c.lat, lng: c.lng }]),
  );
  const branchCoordsById = new Map(
    (branchCoords ?? []).map((c) => [c.branch_id, { lat: c.lat, lng: c.lng }]),
  );
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
    current.push(mapBranch(branch, byBranch.get(branch.id) ?? [], branchCoordsById.get(branch.id)));
    branchesByBusiness.set(branch.business_id, current);
  }
  return (rows ?? []).map((row) => ({
    ...mapDbBusiness(
      row as never,
      byBusiness.get(row.id) ?? [],
      branchesByBusiness.get(row.id) ?? [],
    ),
    lat: businessCoordsById.get(row.id)?.lat ?? null,
    lng: businessCoordsById.get(row.id)?.lng ?? null,
    isLaunchPartner: launchPartnerIds.has(row.id),
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
    { data: launchPartner, error: launchPartnerError },
    { data: businessCoords, error: businessCoordsError },
    catalog,
    packagesEnabled,
  ] = await Promise.all([
    client.from("business_links").select("*").eq("business_id", row.id),
    client
      .from("business_branches")
      .select(PUBLIC_BRANCH_COLUMNS)
      .eq("business_id", row.id)
      .eq("published", true),
    client
      .from("success_partners")
      .select("business_id")
      .eq("kind", "business")
      .eq("active", true)
      .eq("business_id", row.id)
      .maybeSingle(),
    client.rpc("public_business_coordinates").eq("business_id", row.id).maybeSingle() as unknown as Promise<{
      data: BusinessCoordRow | null;
      error: { message: string } | null;
    }>,
    readPlanCatalog(client),
    isPackagesEnabled(client),
  ]);
  if (linksError) throw new Error(linksError.message);
  if (branchesError) throw new Error(branchesError.message);
  if (launchPartnerError) throw new Error(launchPartnerError.message);
  if (businessCoordsError) throw new Error(businessCoordsError.message);
  const branchIds = (branches ?? []).map((b) => b.id as string);
  const { data: branchCoords, error: branchCoordsError } = branchIds.length
    ? ((await client.rpc("public_branch_coordinates").in("branch_id", branchIds)) as unknown as {
        data: BranchCoordRow[] | null;
        error: { message: string } | null;
      })
    : { data: [] as BranchCoordRow[], error: null };
  if (branchCoordsError) throw new Error(branchCoordsError.message);
  const branchCoordsById = new Map(
    (branchCoords ?? []).map((c) => [c.branch_id, { lat: c.lat, lng: c.lng }]),
  );
  const menu = packagesEnabled && !canUseMenu(row) ? [] : await fetchPublicMenu(client, row.id);
  const mappedLinks = (links ?? []).map(mapLink);
  const business = mapDbBusiness(
    row as never,
    mappedLinks.filter((l) => !l.branch_id),
    (branches ?? []).map((b) =>
      mapBranch(
        b,
        mappedLinks.filter((l) => l.branch_id === b.id),
        branchCoordsById.get(b.id),
      ),
    ),
  );
  return {
    ...business,
    lat: businessCoords?.lat ?? null,
    lng: businessCoords?.lng ?? null,
    menu,
    isLaunchPartner: !!launchPartner,
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
