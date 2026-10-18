import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Serves the exact stored text of one agreement version (agreement_versions.full_text) — the same
 * generic bilingual contract template every owner already sees before accepting, with its blanks
 * unfilled. No business-specific or personal data; safe to be reachable without signing in (the
 * confirmation email links here so the click works even when signed out).
 */
export const getAgreementVersionText = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ version: z.string().max(20) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: text, error } = await supabaseAdmin.rpc("get_agreement_version_text", {
      _terms_version: data.version,
    });
    if (error) throw new Error(error.message);
    return { text: text ?? null };
  });
