import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, publicClient } from "@/lib/businesses.server";

/**
 * Business Disclosure (الإفصاح التجاري). Kept in its own table, not `site_settings.content`: see
 * the migration for why. Reads split into an admin path (always sees the current draft, even
 * inactive) and a public path (row-level security makes the row disappear entirely while
 * inactive), so a draft can never leak through the public path no matter what calls it.
 */
export type DisclosureRecord = {
  active: boolean;
  business_name: string | null;
  owner_name: string | null;
  cr_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
};

const DisclosureInput = z.object({
  active: z.boolean(),
  business_name: z.string().trim().max(200).nullable(),
  owner_name: z.string().trim().max(200).nullable(),
  cr_number: z.string().trim().max(50).nullable(),
  address: z.string().trim().max(300).nullable(),
  email: z.string().trim().max(255).nullable(),
  phone: z.string().trim().max(40).nullable(),
});

/** Public: the row when active, or `null` when it isn't — used by /disclosure and the footer link.
 * No auth required; RLS alone decides what comes back, so this can never expose a draft. */
export const getDisclosurePublic = createServerFn({ method: "GET" }).handler(
  async (): Promise<DisclosureRecord | null> => {
    const { data, error } = await publicClient()
      .from("business_disclosure")
      .select("active, business_name, owner_name, cr_number, address, email, phone")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DisclosureRecord | null) ?? null;
  },
);

/** Admin: always the current draft, active or not, so the editor has something to show. */
export const getDisclosureAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DisclosureRecord> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("business_disclosure")
      .select("active, business_name, owner_name, cr_number, address, email, phone")
      .eq("id", "default")
      .single();
    if (error) throw new Error(error.message);
    return data as DisclosureRecord;
  });

export const saveDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DisclosureInput.parse(input))
  .handler(async ({ data, context }): Promise<DisclosureRecord> => {
    await assertAdmin(context.supabase, context.userId);
    if (data.active && !(data.business_name?.trim() && data.cr_number?.trim())) {
      throw new Error("لا يمكن تفعيل الإفصاح التجاري قبل إدخال الاسم التجاري ورقم السجل التجاري.");
    }
    const empty = (v: string | null) => (v && v.trim() ? v.trim() : null);
    const { data: row, error } = await context.supabase
      .from("business_disclosure")
      .update({
        active: data.active,
        business_name: empty(data.business_name),
        owner_name: empty(data.owner_name),
        cr_number: empty(data.cr_number),
        address: empty(data.address),
        email: empty(data.email),
        phone: empty(data.phone),
      })
      .eq("id", "default")
      .select("active, business_name, owner_name, cr_number, address, email, phone")
      .single();
    if (error) throw new Error(error.message);
    return row as DisclosureRecord;
  });
