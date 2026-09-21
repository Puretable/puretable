import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./businesses.server";
import { emailSchema, type SubscriptionRow } from "./owner-portal";

const uuid = z.string().uuid();
const db = (client: unknown) => client as SupabaseClient;

export type AdminOwner = { id: string; business_id: string; email: string; created_at: string };
export type AdminPendingRequest = SubscriptionRow & {
  businesses: { name: string; name_ar: string | null; city: string; plan: string } | null;
};

const HISTORY_COLUMNS =
  "id,business_id,plan,status,source,period_months,requested_at,starts_at,ends_at,ended_at,payment_status,payment_provider,payment_reference,amount_halalas,currency,notes";

export const adminListOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<AdminOwner[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await db(context.supabase)
      .from("business_owners")
      .select("id,business_id,email,created_at")
      .eq("business_id", data.businessId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdminOwner[];
  });

async function audit(
  context: { supabase: unknown; userId: string; claims: { email?: unknown } },
  action: string,
  entityId: string,
  details: Record<string, unknown>,
) {
  await db(context.supabase)
    .from("admin_audit_log")
    .insert({
      user_id: context.userId,
      user_email: typeof context.claims.email === "string" ? context.claims.email : null,
      action,
      entity: "business_owner",
      entity_id: entityId,
      entity_label: String(details["email"] ?? ""),
      details,
    });
}

export const adminAddOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: uuid, email: emailSchema }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminOwner> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await db(context.supabase)
      .from("business_owners")
      .insert({ business_id: data.businessId, email: data.email })
      .select("id,business_id,email,created_at")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, "add_business_owner", data.businessId, { email: data.email });
    return row as AdminOwner;
  });

export const adminRemoveOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await db(context.supabase)
      .from("business_owners")
      .delete()
      .eq("id", data.id)
      .select("business_id,email")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (row) await audit(context, "remove_business_owner", row.business_id, { email: row.email });
    return { ok: true as const };
  });

export const adminListSubscriptionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<SubscriptionRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await db(context.supabase)
      .from("business_subscriptions")
      .select(HISTORY_COLUMNS)
      .eq("business_id", data.businessId)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as SubscriptionRow[];
  });

export const adminListPendingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPendingRequest[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: rows, error } = await db(context.supabase)
      .from("business_subscriptions")
      .select(`${HISTORY_COLUMNS},businesses(name,name_ar,city,plan)`)
      .eq("status", "pending")
      .order("requested_at")
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AdminPendingRequest[];
  });

export const adminActivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        endsAt: z.string().datetime({ offset: true }).nullable().default(null),
        paymentStatus: z.enum(["not_required", "paid"]).default("not_required"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await db(context.supabase).rpc("admin_activate_subscription", {
      _id: data.id,
      _ends_at: data.endsAt,
      _payment_status: data.paymentStatus,
    });
    if (error) throw new Error(error.message);
    return row as SubscriptionRow;
  });

export const adminRejectSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, note: z.string().trim().max(500).nullable().default(null) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await db(context.supabase).rpc("admin_reject_subscription", {
      _id: data.id,
      _note: data.note || null,
    });
    if (error) throw new Error(error.message);
    return row as SubscriptionRow;
  });

export const adminSuspendAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ businessId: uuid, reason: z.string().trim().max(500).nullable().default(null) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await db(context.supabase).rpc("admin_suspend_business_access", {
      _business_id: data.businessId,
      _reason: data.reason || null,
    });
    if (error) throw new Error(error.message);
    return row as SubscriptionRow;
  });

export const adminReactivateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await db(context.supabase).rpc(
      "admin_reactivate_business_access",
      {
        _business_id: data.businessId,
      },
    );
    if (error) throw new Error(error.message);
    return row as SubscriptionRow;
  });
