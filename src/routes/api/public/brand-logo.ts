import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/brand-logo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin
            .from("site_settings")
            .select("layout")
            .eq("id", "default")
            .maybeSingle();
          const layout = data?.layout as { media?: Record<string, string> } | null;
          const configured = layout?.media?.["logo"]?.trim();
          if (configured && /^https?:\/\//i.test(configured)) {
            return Response.redirect(configured, 302);
          }
        } catch {
          // The stable fallback remains available even if settings cannot load.
        }
        // public/favicon.png (the old wheat mark) is kept, unreferenced, for rollback.
        return Response.redirect(`${origin}/favicon-mark.png`, 302);
      },
    },
  },
});
