import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allow } from "./rate-limit.server";
import {
  deleteMenuItem,
  deleteOwnerBranch,
  deleteOwnerLink,
  saveMenuItem,
  saveOwnerBranch,
  saveOwnerLink,
  signOwnerUpload,
  updateOwnerBusiness,
  updateOwnerPhotos,
  type Actor,
} from "./owner-manage.server";
import {
  MenuItemInput,
  OwnerBranchInput,
  OwnerBusinessInput,
  OwnerLinkInput,
  OwnerPhotosInput,
  type OwnerBusinessDetail,
} from "./owner-manage.schemas";

const uuid = z.string().uuid();
const db = (client: unknown) => client as SupabaseClient;

type Ctx = { supabase: unknown; userId: string };

/** Builds the actor for one request. The service-role client is loaded lazily, server-side only. */
async function actorFor(context: Ctx): Promise<Actor> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabaseUrl = process.env["SUPABASE_URL"];
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  return {
    userClient: db(context.supabase),
    adminClient: db(supabaseAdmin),
    userId: context.userId,
    supabaseUrl,
  };
}

/** Everything the portal needs to show and edit one business. RLS limits this to the caller's own. */
export const getOwnerBusiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await db(context.supabase)
      .from("businesses")
      .select(
        "*, business_links(*), business_branches(*), business_menu_items(id,business_id,name,name_ar,price,currency,photo_url,safety,sort_order)",
      )
      .eq("id", data.businessId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Forbidden");
    return row as unknown as OwnerBusinessDetail;
  });

export const saveOwnerBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: uuid, business: OwnerBusinessInput }).parse(input),
  )
  .handler(async ({ data, context }) =>
    updateOwnerBusiness(await actorFor(context), data.businessId, data.business),
  );

export const saveOwnerPhotosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: uuid, photos: OwnerPhotosInput }).parse(input),
  )
  .handler(async ({ data, context }) =>
    updateOwnerPhotos(await actorFor(context), data.businessId, data.photos),
  );

export const saveOwnerBranchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OwnerBranchInput.parse(input))
  .handler(async ({ data, context }) => saveOwnerBranch(await actorFor(context), data));

export const deleteOwnerBranchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid, id: uuid }).parse(input))
  .handler(async ({ data, context }) =>
    deleteOwnerBranch(await actorFor(context), data.businessId, data.id),
  );

export const saveOwnerLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => OwnerLinkInput.parse(input))
  .handler(async ({ data, context }) => saveOwnerLink(await actorFor(context), data));

export const deleteOwnerLinkFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid, id: uuid }).parse(input))
  .handler(async ({ data, context }) =>
    deleteOwnerLink(await actorFor(context), data.businessId, data.id),
  );

/** Shared by the owner portal and the admin business page (admins are always allowed). */
export const saveMenuItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MenuItemInput.parse(input))
  .handler(async ({ data, context }) => saveMenuItem(await actorFor(context), data));

export const deleteMenuItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: uuid, id: uuid }).parse(input))
  .handler(async ({ data, context }) =>
    deleteMenuItem(await actorFor(context), data.businessId, data.id),
  );

export const signBusinessUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: uuid, filename: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Storage is billed per object, so cap uploads per person (best effort across workers).
    if (!allow(`upload:${context.userId}`, 60, 3_600_000)) {
      throw new Error("Too many uploads. Try again later.");
    }
    return signOwnerUpload(await actorFor(context), data.businessId, data.filename);
  });
