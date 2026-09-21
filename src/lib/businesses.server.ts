import { readPlanCatalog } from "./subscriptions.server";
import { toFeatures } from "./subscriptions";
import { planOf } from "./plans";
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
  };
}

export async function fetchPublicBusinesses(): Promise<Business[]> {
  const client = publicClient();
  const [
    { data: rows, error: businessesError },
    { data: links, error: linksError },
    { data: branches, error: branchesError },
    catalog,
  ] = await Promise.all([
    client.from("businesses").select("*").order("created_at", { ascending: true }),
    client.from("business_links").select("*"),
    client.from("business_branches").select("*").eq("published", true),
    readPlanCatalog(client),
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
    entitlements: toFeatures(catalog[planOf(row)]),
  }));
}

export async function fetchPublicBusinessBySlug(slug: string): Promise<Business | null> {
  const client = publicClient();
  const { data: row, error } = await client
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const [{ data: links, error: linksError }, { data: branches, error: branchesError }, catalog] =
    await Promise.all([
      client.from("business_links").select("*").eq("business_id", row.id),
      client.from("business_branches").select("*").eq("business_id", row.id).eq("published", true),
      readPlanCatalog(client),
    ]);
  if (linksError) throw new Error(linksError.message);
  if (branchesError) throw new Error(branchesError.message);
  const menu = await fetchPublicMenu(client, row.id);
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
  return { ...business, menu, entitlements: toFeatures(catalog[planOf(row)]) };
}

/**
 * Gluten-free menu items, shown on every plan. A failure here must never take the business page
 * down (for example while a deployment is ahead of its database migration), so it degrades to an
 * empty menu.
 */
async function fetchPublicMenu(client: SupabaseClient, businessId: string): Promise<MenuItem[]> {
  const { data, error } = await client
    .from("business_menu_items")
    .select("id, business_id, name, name_ar, price, currency, photo_url, safety, sort_order")
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
