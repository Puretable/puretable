import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily sweep that moves expired paid subscriptions back to Free.
 * Called by Vercel Cron (GET) with `Authorization: Bearer $CRON_SECRET`.
 * Owners also trigger the same reconciliation whenever they open the portal.
 */
async function run(request: Request) {
  const expected = process.env["CRON_SECRET"];
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (
    supabaseAdmin as unknown as {
      rpc: (fn: string) => Promise<{ data: number | null; error: { message: string } | null }>;
    }
  ).rpc("expire_due_subscriptions");
  if (error) {
    console.error("[subscription-expiry]", error.message);
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true, expired: data ?? 0 });
}

export const Route = createFileRoute("/api/public/subscription-expiry")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
