import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allow, clientKey } from "./rate-limit.server";
import { publicClient } from "./businesses.server";
import { readPlanCatalog } from "./subscriptions.server";
import {
  PLAN_PERIODS,
  emailSchema,
  type OwnerBusiness,
  type OwnerReport,
  type SubscriptionRow,
} from "./owner-portal";
import { PLAN_TIERS } from "./plans";

const uuid = z.string().uuid();
const db = (client: unknown) => client as SupabaseClient;

/**
 * Step 1 of the OTP sign-in. Always answers the same way so the form cannot be used to
 * discover which emails belong to business owners, and only emails an admin has assigned
 * to a business ever trigger an email or create an Auth user.
 */
export const requestOwnerCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ email: emailSchema }).parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    if (
      !allow(clientKey(request, "owner-code"), 10, 600_000) ||
      !allow(`owner-code:${data.email}`, 3, 600_000)
    ) {
      throw new Error("محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner, error } = await db(supabaseAdmin)
      .from("business_owners")
      .select("id")
      .eq("email", data.email)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[owner-code] lookup failed", error.message);
      return { ok: true as const };
    }
    if (owner) {
      const origin = (process.env["APP_URL"] || new URL(request.url).origin).replace(/\/$/, "");
      const { error: otpError } = await publicClient().auth.signInWithOtp({
        email: data.email,
        options: { shouldCreateUser: true, emailRedirectTo: `${origin}/portal` },
      });
      if (otpError) console.error("[owner-code] send failed", otpError.message);
    }
    return { ok: true as const };
  });

/**
 * Fully open self-service signup: creates a new, unpublished business and links the given email as
 * its owner, then immediately sends that email a sign-in code — same mechanism as `requestOwnerCode`,
 * just without needing the owner to already exist first. The business starts exactly like any
 * admin-created one (Free plan, unpublished until an admin reviews it) and still needs the owner to
 * accept the Partnership Agreement on first login before reaching the dashboard.
 */
export const signupCreateBusiness = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        businessName: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(/^[^<>]*$/, "Angle brackets are not allowed"),
        email: emailSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    if (
      !allow(clientKey(request, "signup"), 5, 600_000) ||
      !allow(`signup:${data.email}`, 3, 600_000)
    ) {
      throw new Error("محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.");
    }
    const client = publicClient();
    const { error } = await client.rpc("signup_create_business", {
      _business_name: data.businessName,
      _email: data.email,
    });
    if (error) throw new Error(error.message);
    const origin = (process.env["APP_URL"] || new URL(request.url).origin).replace(/\/$/, "");
    const { error: otpError } = await client.auth.signInWithOtp({
      email: data.email,
      options: { shouldCreateUser: true, emailRedirectTo: `${origin}/portal` },
    });
    if (otpError) console.error("[signup] code send failed", otpError.message);
    return { ok: true as const };
  });

/** Plan definitions are public (RLS allows anyone to read them); owners see what each plan offers. */
export const listPlanCatalog = createServerFn({ method: "GET" }).handler(async () =>
  readPlanCatalog(publicClient()),
);

export const getOwnerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerBusiness[]> => {
    const { data, error } = await db(context.supabase).rpc("owner_portal_overview");
    if (error) throw new Error(error.message);
    return (data ?? []) as OwnerBusiness[];
  });

export const getOwnerHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid }).parse(input))
  .handler(async ({ data, context }): Promise<SubscriptionRow[]> => {
    // Row Level Security limits this to businesses the caller owns.
    const { data: rows, error } = await db(context.supabase)
      .from("business_subscriptions")
      .select(
        "id,business_id,plan,status,source,period_months,requested_at,starts_at,ends_at,ended_at,payment_status,payment_provider,payment_reference,amount_halalas,currency,notes",
      )
      .eq("business_id", data.businessId)
      .order("requested_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as SubscriptionRow[];
  });

export const requestPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: uuid,
        plan: z.enum(PLAN_TIERS as [string, ...string[]]),
        periodMonths: z.union([z.literal(PLAN_PERIODS[0]), z.literal(PLAN_PERIODS[1])]).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<SubscriptionRow> => {
    const { data: row, error } = await db(context.supabase).rpc("request_business_plan", {
      _business_id: data.businessId,
      _plan: data.plan,
      _period_months: data.periodMonths,
    });
    if (error) throw new Error(error.message);
    return row as SubscriptionRow;
  });

export const cancelPlanRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await db(context.supabase).rpc("cancel_plan_request", {
      _business_id: data.businessId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getOwnerReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: uuid,
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OwnerReport> => {
    const { data: report, error } = await db(context.supabase).rpc("owner_business_report", {
      _business_id: data.businessId,
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return report as OwnerReport;
  });
