/**
 * Pre-launch waitlist (public sign-up) and the admin inbox for it and for
 * partner interest requests received before the public form was retired in
 * favour of the Business Owner Portal. Only an admin can read, update the
 * status of, or delete stored requests.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/businesses.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyWaitlistSignup } from "@/lib/email.server";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "interested",
  "agreed",
  "not_interested",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "جديد",
  contacted: "تم التواصل",
  interested: "مهتم",
  agreed: "تم الاتفاق",
  not_interested: "غير مهتم",
};

export const joinWaitlist = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(255),
        city: z.string().max(80).nullish(),
        source: z.string().max(80).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const id = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("waitlist").insert({ id, ...data });
    // A repeat sign-up is a success from the visitor's point of view.
    if (error && !error.message.toLowerCase().includes("duplicate")) throw new Error(error.message);
    if (!error) await notifyWaitlistSignup({ id, ...data });
    return { ok: true, duplicate: !!error };
  });

export const listPartnerLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("partner_leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setPartnerLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(LEAD_STATUSES),
        notes: z.string().max(2000).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch = {
      status: data.status,
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    };
    const { error } = await context.supabase.from("partner_leads").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePartnerLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("partner_leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWaitlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
