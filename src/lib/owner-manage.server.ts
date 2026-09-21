import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertAllowedPhotoUrls,
  assertPhotoLimit,
  ownerUploadPrefix,
  safetyFieldsChanged,
  type MenuItemInput,
  type OwnerBranchInput,
  type OwnerBusinessInput,
  type OwnerLinkInput,
  type OwnerPhotosInput,
} from "./owner-manage.schemas";

/**
 * Owner self-service operations.
 *
 * Owners have no direct write access to any table. Every change comes through here:
 *   1. `owner_access_state()` (a database function that reads the caller's verified Auth email)
 *      decides whether the caller owns the business and whether an admin has suspended access;
 *   2. only then is the write performed with the service role, from a whitelisted payload.
 * Every child row (branch, link, menu item) is looked up by BOTH its id and the business id, so an
 * owner can never touch another business by guessing an id.
 */
export type Actor = {
  /** Client carrying the caller's own JWT (RLS applies). */
  userClient: SupabaseClient;
  /** Service-role client. Used only after an access check has passed. */
  adminClient: SupabaseClient;
  userId: string;
  supabaseUrl: string;
};

export type Access = { admin: boolean };

async function isAdmin(actor: Actor): Promise<boolean> {
  const { data, error } = await actor.userClient.rpc("has_role", {
    _user_id: actor.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  return !!data;
}

/** Owner of the business and not suspended. */
export async function requireOwnerAccess(actor: Actor, businessId: string): Promise<void> {
  const { data, error } = await actor.userClient.rpc("owner_access_state", {
    _business_id: businessId,
  });
  if (error) throw new Error(error.message);
  if (data === "suspended") throw new Error("Access suspended");
  if (data !== "ok") throw new Error("Forbidden");
}

/** Admins may always manage; owners only while access is active. */
export async function requireOwnerOrAdmin(actor: Actor, businessId: string): Promise<Access> {
  if (await isAdmin(actor)) return { admin: true };
  await requireOwnerAccess(actor, businessId);
  return { admin: false };
}

function friendlyDbError(message: string): string {
  const branch = message.match(
    /Branch limit reached for (free|pro|premium) plan \(maximum (\d+)\)/,
  );
  if (branch) return `Branch limit reached for ${branch[1]} plan (maximum ${branch[2]})`;
  return message;
}

function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}

export async function updateOwnerBusiness(
  actor: Actor,
  businessId: string,
  input: OwnerBusinessInput,
) {
  await requireOwnerAccess(actor, businessId);
  const { data: current, error: readError } = await actor.adminClient
    .from("businesses")
    .select("id, safety, shared_kitchen, dedicated_gf, verified")
    .eq("id", businessId)
    .single();
  if (readError || !current) throw new Error("Forbidden");

  const payload: Record<string, unknown> = {
    ...input,
    discount_code: input.discount_code?.trim() || null,
  };
  // Safety wording is the owner's responsibility, but an admin's "verified" badge vouches for the
  // information as it was reviewed, so it is withdrawn whenever that information changes.
  if (current.verified && safetyFieldsChanged(current, input)) payload["verified"] = false;

  const { data, error } = await actor.adminClient
    .from("businesses")
    .update(payload)
    .eq("id", businessId)
    .select()
    .single();
  if (error) throw new Error(friendlyDbError(error.message));
  return data;
}

/** Cover + gallery. Kept separate from the info form so neither can overwrite the other. */
export async function updateOwnerPhotos(actor: Actor, businessId: string, input: OwnerPhotosInput) {
  await requireOwnerAccess(actor, businessId);
  const { data: current, error: readError } = await actor.adminClient
    .from("businesses")
    .select("id, plan, cover_url, photos")
    .eq("id", businessId)
    .single();
  if (readError || !current) throw new Error("Forbidden");
  const { data: plan, error: planError } = await actor.adminClient
    .from("subscription_plans")
    .select("photo_limit")
    .eq("id", current.plan)
    .single();
  if (planError || !plan) throw new Error("Plan not found");

  const cover = input.cover_url ?? null;
  const gallery = unique(input.photos).filter((url) => url !== cover);
  const saved: string[] = [current.cover_url, ...(current.photos ?? [])].filter(Boolean);
  assertAllowedPhotoUrls([...(cover ? [cover] : []), ...gallery], {
    supabaseUrl: actor.supabaseUrl,
    businessId,
    alreadySaved: saved,
  });
  assertPhotoLimit((cover ? 1 : 0) + gallery.length, plan.photo_limit, unique(saved).length);

  const { data, error } = await actor.adminClient
    .from("businesses")
    .update({ cover_url: cover, photos: gallery })
    .eq("id", businessId)
    .select("id, cover_url, photos")
    .single();
  if (error) throw new Error(friendlyDbError(error.message));
  return data;
}

export async function saveOwnerBranch(actor: Actor, input: OwnerBranchInput) {
  await requireOwnerAccess(actor, input.business_id);
  const { id, business_id, ...fields } = input;
  if (id) {
    const { data: existing } = await actor.adminClient
      .from("business_branches")
      .select("id")
      .eq("id", id)
      .eq("business_id", business_id)
      .maybeSingle();
    if (!existing) throw new Error("Forbidden");
    const { data, error } = await actor.adminClient
      .from("business_branches")
      .update(fields)
      .eq("id", id)
      .eq("business_id", business_id)
      .select()
      .single();
    if (error) throw new Error(friendlyDbError(error.message));
    return data;
  }
  const { data, error } = await actor.adminClient
    .from("business_branches")
    .insert({ ...fields, business_id })
    .select()
    .single();
  if (error) throw new Error(friendlyDbError(error.message));
  return data;
}

export async function deleteOwnerBranch(actor: Actor, businessId: string, id: string) {
  await requireOwnerAccess(actor, businessId);
  const { error } = await actor.adminClient
    .from("business_branches")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

async function assertBranchBelongs(actor: Actor, businessId: string, branchId: string) {
  const { data } = await actor.adminClient
    .from("business_branches")
    .select("id")
    .eq("id", branchId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export async function saveOwnerLink(actor: Actor, input: OwnerLinkInput) {
  await requireOwnerAccess(actor, input.business_id);
  const { id, business_id, ...fields } = input;
  if (fields.branch_id) await assertBranchBelongs(actor, business_id, fields.branch_id);
  if (id) {
    const { data: existing } = await actor.adminClient
      .from("business_links")
      .select("id")
      .eq("id", id)
      .eq("business_id", business_id)
      .maybeSingle();
    if (!existing) throw new Error("Forbidden");
    const { data, error } = await actor.adminClient
      .from("business_links")
      .update(fields)
      .eq("id", id)
      .eq("business_id", business_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await actor.adminClient
    .from("business_links")
    .insert({ ...fields, business_id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteOwnerLink(actor: Actor, businessId: string, id: string) {
  await requireOwnerAccess(actor, businessId);
  const { error } = await actor.adminClient
    .from("business_links")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

export async function saveMenuItem(actor: Actor, input: MenuItemInput) {
  const access = await requireOwnerOrAdmin(actor, input.business_id);
  const { id, business_id, price, ...rest } = input;
  const fields = {
    ...rest,
    price: price === null ? null : Math.round(price * 100) / 100,
  };

  if (fields.photo_url && !access.admin) {
    let existingPhoto: string | null = null;
    if (id) {
      const { data: existing } = await actor.adminClient
        .from("business_menu_items")
        .select("photo_url")
        .eq("id", id)
        .eq("business_id", business_id)
        .maybeSingle();
      existingPhoto = existing?.photo_url ?? null;
    }
    assertAllowedPhotoUrls([fields.photo_url], {
      supabaseUrl: actor.supabaseUrl,
      businessId: business_id,
      alreadySaved: existingPhoto ? [existingPhoto] : [],
    });
  }

  if (id) {
    const { data: existing } = await actor.adminClient
      .from("business_menu_items")
      .select("id")
      .eq("id", id)
      .eq("business_id", business_id)
      .maybeSingle();
    if (!existing) throw new Error("Forbidden");
    const { data, error } = await actor.adminClient
      .from("business_menu_items")
      .update(fields)
      .eq("id", id)
      .eq("business_id", business_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await actor.adminClient
    .from("business_menu_items")
    .insert({ ...fields, business_id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMenuItem(actor: Actor, businessId: string, id: string) {
  await requireOwnerOrAdmin(actor, businessId);
  const { error } = await actor.adminClient
    .from("business_menu_items")
    .delete()
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;

/** A one-time signed upload into this business's own folder. */
export async function signOwnerUpload(actor: Actor, businessId: string, filename: string) {
  await requireOwnerOrAdmin(actor, businessId);
  if (!IMAGE_FILE.test(filename)) throw new Error("Only JPG, PNG, WebP or GIF images are allowed");
  const safe = filename.replace(/[^\w.-]+/g, "_").slice(-80);
  const name = `${Date.now()}-${safe}`;
  const path = `owners/${businessId}/${name}`;
  const { data, error } = await actor.adminClient.storage
    .from("business-covers")
    .createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    path,
    readUrl: `${ownerUploadPrefix(actor.supabaseUrl, businessId)}${encodeURIComponent(name)}`,
  };
}
