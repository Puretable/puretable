import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BranchInput, BusinessInput, LinkInput } from "@/lib/businesses.schemas";
import { assertAdmin, AUTHENTICATED_BUSINESS_COLUMNS } from "@/lib/businesses.server";
import { PLAN_TIERS, type PlanTier } from "@/lib/plans";

// -------- Admin --------

/** Publish only after the administrator explicitly confirms the owner's consent. */
export const setBusinessPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), published: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("businesses")
      .update({ published: data.published })
      .eq("id", data.id)
      .select("id,published")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Turn a business name into a URL-safe slug (Arabic names get a short hash). */
function makeSlug(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}-${suffix}` : `place-${suffix}`;
}

function readableBranchError(message: string) {
  const match = message.match(/Branch limit reached for (free|pro|premium) plan \(maximum (\d+)\)/);
  return match
    ? `الحد الحالي لباقة ${match[1]} هو ${match[2]} فروع منشورة. أخفِ فرعاً أو عدّل الباقة من قسم الاشتراكات.`
    : message;
}

export const upsertBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BusinessInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // The slug is optional in the form — generate one when it is missing.
    const payload = {
      ...data,
      slug: data.slug && data.slug.length ? data.slug : makeSlug(data.name),
      // An empty field means the single discount code is inactive.
      discount_code: data.discount_code?.trim() || null,
    };
    const { data: row, error } = await context.supabase
      .from("businesses")
      .upsert(payload, { onConflict: "id" })
      .select(AUTHENTICATED_BUSINESS_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const { data: branches, error: branchError } = await context.supabase
      .from("business_branches")
      .select("id, published, plan_limited")
      .eq("business_id", row.id);
    if (branchError) throw new Error(branchError.message);
    return {
      ...row,
      branch_status: {
        total: branches?.length ?? 0,
        published: branches?.filter((branch) => branch.published).length ?? 0,
        hiddenByPlan: branches?.filter((branch) => branch.plan_limited).length ?? 0,
      },
    };
  });

/** Change only the package and return the branch effects applied by PostgreSQL. */
export const setBusinessPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; plan: PlanTier }) =>
    z
      .object({ id: z.string().uuid(), plan: z.enum(PLAN_TIERS as [PlanTier, ...PlanTier[]]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: before, error: beforeError } = await context.supabase
      .from("business_branches")
      .select("id, published, plan_limited")
      .eq("business_id", data.id);
    if (beforeError) throw new Error(beforeError.message);

    const { data: business, error } = await context.supabase
      .from("businesses")
      .update({ plan: data.plan })
      .eq("id", data.id)
      .select("id, name, plan")
      .single();
    if (error) throw new Error(error.message);

    const { data: after, error: afterError } = await context.supabase
      .from("business_branches")
      .select("id, published, plan_limited")
      .eq("business_id", data.id);
    if (afterError) throw new Error(afterError.message);

    const beforePublished = before?.filter((branch) => branch.published).length ?? 0;
    const published = after?.filter((branch) => branch.published).length ?? 0;
    return {
      business,
      branchStatus: {
        total: after?.length ?? 0,
        published,
        hiddenByPlan: after?.filter((branch) => branch.plan_limited).length ?? 0,
        newlyHidden: Math.max(0, beforePublished - published),
        restored: Math.max(0, published - beforePublished),
      },
    };
  });

export const deleteBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("businesses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LinkInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("business_links")
      .upsert(data, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("business_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BranchInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("business_branches")
      .upsert(data, { onConflict: "id" })
      .select()
      .single();
    if (error) throw new Error(readableBranchError(error.message));
    return row;
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("business_branches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListBusinesses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("businesses")
      .select(`${AUTHENTICATED_BUSINESS_COLUMNS},business_links(*),business_branches(*)`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminGetBusiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("businesses")
      .select(`${AUTHENTICATED_BUSINESS_COLUMNS},business_links(*),business_branches(*)`)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Normalized keys used to detect the same business entered twice (AR or EN). */
function dupKeys(row: { name?: string | null; name_ar?: string | null; slug?: string | null }) {
  const norm = (v?: string | null) =>
    (v ?? "")
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0640]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/^(al|el)[\s-]/i, "")
      .replace(/^ال/, "")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  return [norm(row.name), norm(row.name_ar), norm(row.slug)].filter((k) => k.length > 1);
}

/** How much information a row carries — the richest duplicate wins. */
function richness(row: Record<string, unknown>) {
  const fields = [
    "name_ar",
    "city",
    "city_ar",
    "address",
    "address_ar",
    "phone",
    "instagram",
    "website",
    "cover_url",
    "description",
    "products",
    "maps_url",
    "lat",
    "lng",
  ];
  let score = fields.filter((f) => {
    const v = row[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  const hours = row["hours"] as Record<string, unknown> | null;
  if (hours && Object.keys(hours).length) score += 2;
  score += ((row["business_links"] as unknown[]) ?? []).length * 2;
  score += ((row["business_branches"] as unknown[]) ?? []).length * 2;
  if (row["published"]) score += 1;
  if (row["verified"]) score += 1;
  return score;
}

/** Remove duplicate businesses automatically, keeping the most detailed one. */
export const dedupeBusinesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("businesses")
      .select(`${AUTHENTICATED_BUSINESS_COLUMNS},business_links(id),business_branches(id)`);
    if (error) throw new Error(error.message);

    // Rows are grouped when ANY of their names (Arabic, English or slug) match,
    // so the same place entered twice in two languages collapses into one group.
    const groups = new Map<string, Record<string, unknown>[]>();
    const keyToGroup = new Map<string, string>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const keys = dupKeys(row as never);
      if (!keys.length) continue;
      const groupId = keys.map((k) => keyToGroup.get(k)).find(Boolean) ?? keys[0]!;
      for (const k of keys) keyToGroup.set(k, groupId);
      groups.set(groupId, [...(groups.get(groupId) ?? []), row]);
    }

    const removed: string[] = [];
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      const sorted = [...rows].sort((a, b) => richness(b) - richness(a));
      for (const loser of sorted.slice(1)) {
        const { error: delErr } = await context.supabase
          .from("businesses")
          .delete()
          .eq("id", loser["id"] as string);
        if (!delErr) removed.push(String(loser["name"] ?? ""));
      }
    }
    return { removed, count: removed.length };
  });
