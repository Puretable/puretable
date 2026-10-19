import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin billing/compliance list: one row per business with its signup date, latest payment status,
 * post-payment info status, and the manually-edited invoice status. Both RPCs below are admin-gated
 * in the database itself (`has_role(..., 'admin')`) — the exact same check every other admin-only
 * function in this app already uses, so there is no separate or parallel permission system here.
 */
export type BusinessBillingRow = {
  id: string;
  name: string;
  name_ar: string | null;
  created_at: string;
  plan: "free" | "pro" | "premium";
  business_info_completed: boolean;
  invoice_status: "sent" | "not_sent";
  invoice_trade_name: string | null;
  invoice_cr_number: string | null;
  invoice_tax_number: string | null;
  invoice_address: string | null;
  invoice_email: string | null;
  invoice_phone: string | null;
  invoice_representative_name: string | null;
  invoice_representative_title: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  /** Append-only evidence trail — newest first. "legacy" entries have accepted_by_email === null. */
  acceptance_history: {
    terms_version: string;
    accepted_at: string;
    accepted_by_email: string | null;
  }[];
  payment_status: "not_required" | "unpaid" | "pending" | "paid" | "failed" | "refunded" | null;
  subscription_status:
    "pending" | "active" | "suspended" | "expired" | "superseded" | "cancelled" | "rejected" | null;
};

export const adminListBusinessBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_business_billing");
    if (error) throw new Error(error.message);
    return (data ?? []) as BusinessBillingRow[];
  });

export const adminSetInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: z.string().uuid(), status: z.enum(["sent", "not_sent"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("admin_set_invoice_status", {
      _business_id: data.businessId,
      _status: data.status,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
