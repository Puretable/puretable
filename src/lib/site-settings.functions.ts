import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/businesses.server";
import { normalizeSettings, type SiteSettings } from "@/lib/site-settings";

const SiteSettingsInput = z
  .unknown()
  .transform((value) => normalizeSettings(value))
  .refine(
    (value) => JSON.stringify(value).length <= 250_000,
    "إعدادات الموقع أكبر من الحد المسموح.",
  );

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ settings: SiteSettingsInput }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = data.settings as SiteSettings;
    const { error } = await supabaseAdmin.from("site_settings").upsert({
      id: "default",
      theme: settings.theme,
      content: settings.content,
      sections: settings.sections,
      layout: settings.layout,
      draft: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setSiteLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ live: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readError } = await supabaseAdmin
      .from("site_settings")
      .select("sections")
      .eq("id", "default")
      .single();
    if (readError) throw new Error(readError.message);
    const sections = {
      ...((current.sections as Record<string, boolean> | null) ?? {}),
      site_live: data.live,
    };
    const { error } = await supabaseAdmin
      .from("site_settings")
      .update({ sections })
      .eq("id", "default");
    if (error) throw new Error(error.message);
    return { sections };
  });
