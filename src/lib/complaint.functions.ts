import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/businesses.server";
import { notifyComplaintSubmission } from "@/lib/email.server";

export const COMPLAINTS_QUERY_KEY = ["admin", "complaints"] as const;
export const COMPLAINT_STATUSES = ["new", "in_review", "resolved", "closed"] as const;

const ComplaintInput = z
  .object({
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(255).or(z.literal("")),
    phone: z.string().trim().min(8).max(30),
    complaint_type: z.string().trim().min(2).max(80),
    order_reference: z.string().trim().max(100).optional().default(""),
    details: z.string().trim().min(10).max(4000),
    accepted: z.literal(true),
  })
  .transform(({ accepted: _accepted, ...input }) => input);

export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const submitComplaint = createServerFn({ method: "POST" })
  .validator((input: unknown) => ComplaintInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = crypto.randomUUID();
    const { error } = await supabaseAdmin.from("complaints").insert({
      id,
      full_name: data.full_name,
      email: data.email || null,
      phone: data.phone,
      complaint_type: data.complaint_type,
      order_reference: data.order_reference || null,
      details: data.details,
    });
    if (error) throw new Error(error.message);
    await notifyComplaintSubmission({
      id,
      name: data.full_name,
      email: data.email || null,
      phone: data.phone,
      complaintType: data.complaint_type,
      orderReference: data.order_reference || null,
      details: data.details,
    });
    return { id };
  });

export const adminListComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("complaints")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(COMPLAINT_STATUSES),
        admin_notes: z.string().trim().max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: current, error: readError } = await context.supabase
      .from("complaints")
      .select("initial_response_at,resolved_at")
      .eq("id", data.id)
      .single();
    if (readError) throw new Error(readError.message);
    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("complaints")
      .update({
        status: data.status,
        admin_notes: data.admin_notes || null,
        initial_response_at: current.initial_response_at ?? (data.status === "new" ? null : now),
        resolved_at:
          data.status === "resolved" || data.status === "closed"
            ? current.resolved_at || now
            : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("complaints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
