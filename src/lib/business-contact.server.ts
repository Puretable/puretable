import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessContactInput } from "./businesses.schemas";

/**
 * The 4 business-level contact fields — shared by both the admin page and the owner portal (the
 * caller is responsible for its own authorization check before calling this). website/instagram
 * are plain `businesses` columns; tiktok/email upsert (or remove, when cleared) a business-level
 * (branch_id null) business_links row, kept to one-per-platform by business_links_business_level_unique.
 *
 * Deliberately its own file, not part of businesses.server.ts: that file imports from
 * @/data/businesses, which imports image assets directly — fine under Vite, but it breaks plain
 * `tsx` execution (e.g. scripts/verify-owner-self-service.ts). This file has no such dependency.
 */
export async function saveBusinessContact(client: SupabaseClient, input: BusinessContactInput) {
  const { business_id, website, instagram, tiktok, email } = input;
  const { error: bizError } = await client
    .from("businesses")
    .update({ website, instagram })
    .eq("id", business_id);
  if (bizError) throw new Error(bizError.message);

  for (const [platform, url] of [
    ["tiktok", tiktok],
    ["email", email],
  ] as const) {
    if (url) {
      // Not a plain .upsert(): Postgres can't use a PARTIAL unique index (branch_id is null and
      // platform in (...)) as an ON CONFLICT target without a matching WHERE clause, which the
      // supabase-js upsert API has no way to express. Select-then-write instead; the partial index
      // still guards against duplicates from any other path (e.g. a race or a future bypass).
      const { data: existing, error: readError } = await client
        .from("business_links")
        .select("id")
        .eq("business_id", business_id)
        .is("branch_id", null)
        .eq("platform", platform)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      const { error } = existing
        ? await client.from("business_links").update({ url }).eq("id", existing.id)
        : await client
            .from("business_links")
            .insert({ business_id, branch_id: null, platform, url, sort_order: 0 });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client
        .from("business_links")
        .delete()
        .eq("business_id", business_id)
        .is("branch_id", null)
        .eq("platform", platform);
      if (error) throw new Error(error.message);
    }
  }

  const { data, error } = await client
    .from("businesses")
    .select(
      "id,slug,name,name_ar,category,categories,safety,region,city,cities,city_ar,district,district_ar,address,address_ar,lat,lng,phone,whatsapp,instagram,website,maps_url,cover_url,photos,description,description_ar,products,products_ar,hours,plan,offers_booking,discount_code,verified,dedicated_gf,shared_kitchen,precautions_note,no_location,published,created_at,updated_at,terms_accepted_at,terms_version,business_info_completed,needs_review,review_notes",
    )
    .eq("id", business_id)
    .single();
  if (error) throw new Error(error.message);
  return { ...data, tiktok: tiktok ?? null, email: email ?? null };
}
