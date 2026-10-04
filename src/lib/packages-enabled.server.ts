import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Packages/payments can be temporarily disabled platform-wide (admin toggle in Appearance). While
 * disabled, every business gets full Premium entitlements for free — a display-layer override only,
 * never touching the stored `plan` value or any package/subscription data.
 *
 * Deliberately its own file with no other imports: `businesses.server.ts` pulls in Vite-only asset
 * imports (category images) that break the plain Node/tsx runtime this repo's test scripts use, and
 * this helper needs to be importable from both.
 */
export async function isPackagesEnabled(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client
    .from("site_settings")
    .select("sections")
    .eq("id", "default")
    .maybeSingle();
  if (error || !data) return false;
  const sections = data.sections as Record<string, boolean> | null;
  return sections?.["packages_enabled"] === true;
}
