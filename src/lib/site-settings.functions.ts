import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/businesses.server";
import {
  AUTO_TRANSLATE_KEYS,
  normalizeSettings,
  type SiteContent,
  type SiteSettings,
} from "@/lib/site-settings";
import { translateArabicToEnglish } from "@/lib/translate.server";

const SiteSettingsInput = z
  .unknown()
  .transform((value) => normalizeSettings(value))
  .refine(
    (value) => JSON.stringify(value).length <= 250_000,
    "إعدادات الموقع أكبر من الحد المسموح.",
  );

/**
 * For the fixed list of Arabic-only admin fields (`AUTO_TRANSLATE_KEYS`), regenerate the English
 * side from the Arabic text whenever the Arabic changed. Translation failures never lose data:
 * the previously saved English text is kept, and the Arabic is saved either way. Text that did not
 * change is left untouched so an unrelated save never re-translates (and never re-spends the free
 * translation quota on) content nobody edited.
 */
async function applyAutoTranslations(
  incoming: SiteContent,
  previous: SiteContent,
): Promise<SiteContent> {
  const next = { ...incoming };
  for (const key of AUTO_TRANSLATE_KEYS) {
    const draft = incoming[key];
    if (!draft) continue;
    const ar = draft.ar?.trim() ?? "";
    const previousAr = previous[key]?.ar?.trim() ?? "";
    const previousEn = previous[key]?.en ?? "";
    if (!ar) {
      next[key] = { ar: "", en: "" };
      continue;
    }
    if (ar === previousAr) {
      // Unchanged Arabic: keep whatever English is already stored, ignore anything else supplied.
      next[key] = { ar: draft.ar, en: previousEn };
      continue;
    }
    try {
      next[key] = { ar: draft.ar, en: await translateArabicToEnglish(ar) };
    } catch (translateError) {
      console.error(`[site-settings] auto-translate failed for "${key}"`, translateError);
      next[key] = { ar: draft.ar, en: previousEn };
    }
  }
  return next;
}

export const saveSiteSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ settings: SiteSettingsInput }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = data.settings as SiteSettings;
    const { data: currentRow, error: readError } = await supabaseAdmin
      .from("site_settings")
      .select("content")
      .eq("id", "default")
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    const previousContent = (currentRow?.content as SiteContent | null) ?? {};
    const content = await applyAutoTranslations(settings.content, previousContent);
    const { error } = await supabaseAdmin.from("site_settings").upsert({
      id: "default",
      theme: settings.theme,
      content,
      sections: settings.sections,
      layout: settings.layout,
      draft: null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, content };
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
