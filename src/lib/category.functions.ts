import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, publicClient } from "@/lib/businesses.server";

export const CATEGORY_CATALOG_KEY = ["place-categories"] as const;

export const CATEGORY_LEVELS = ["main", "sub"] as const;
export const CATEGORY_BEHAVIORS = ["manual", "booking", "featured", "nearby"] as const;
export const CATEGORY_ICONS = [
  "tag",
  "calendar",
  "star",
  "map-pin",
  "truck",
  "shopping-bag",
  "utensils",
  "coffee",
  "cookie",
  "cake",
  "home",
  "shopping-cart",
] as const;

export type CategoryLevel = (typeof CATEGORY_LEVELS)[number];
export type CategoryBehavior = (typeof CATEGORY_BEHAVIORS)[number];
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export type PlaceCategory = {
  id: string;
  value: string;
  slug: string;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  level: CategoryLevel;
  behavior: CategoryBehavior;
  icon: CategoryIcon;
  visible: boolean;
  sort_order: number;
  usage_count?: number;
};

const CategoryInput = z
  .object({
    id: z.string().uuid().optional(),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      )
      .pipe(z.string().regex(/^[a-z0-9-]+$/)),
    name_ar: z.string().trim().min(1).max(80),
    name_en: z.string().trim().min(1).max(80),
    description_ar: z.string().trim().max(180).default(""),
    description_en: z.string().trim().max(180).default(""),
    level: z.enum(CATEGORY_LEVELS),
    behavior: z.enum(CATEGORY_BEHAVIORS).default("manual"),
    icon: z.enum(CATEGORY_ICONS).default("tag"),
    visible: z.boolean().default(true),
    sort_order: z.number().int().min(0).max(10000).default(0),
  })
  .transform((input) => ({
    ...input,
    behavior: input.level === "sub" ? ("manual" as const) : input.behavior,
  }));

/** Public catalogue. RLS returns visible rows only to signed-out visitors. */
export const listPlaceCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("place_categories")
    .select(
      "id,value,slug,name_ar,name_en,description_ar,description_en,level,behavior,icon,visible,sort_order",
    )
    .eq("visible", true)
    .order("level")
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as PlaceCategory[];
});

export const adminListPlaceCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const [
      { data: categories, error },
      { data: businesses, error: businessError },
      { data: launchPartners, error: launchPartnersError },
    ] = await Promise.all([
      context.supabase
        .from("place_categories")
        .select(
          "id,value,slug,name_ar,name_en,description_ar,description_en,level,behavior,icon,visible,sort_order",
        )
        .order("level")
        .order("sort_order")
        .order("created_at"),
      context.supabase.from("businesses").select("id,category,categories,offers_booking,plan"),
      context.supabase.from("success_partners").select("business_id").eq("kind", "business").eq("active", true),
    ]);
    if (error) throw new Error(error.message);
    if (businessError) throw new Error(businessError.message);
    if (launchPartnersError) throw new Error(launchPartnersError.message);
    const launchPartnerIds = new Set((launchPartners ?? []).map((p) => p.business_id));

    return ((categories ?? []) as PlaceCategory[]).map((category) => ({
      ...category,
      usage_count: (businesses ?? []).filter((business) => {
        if (category.behavior === "booking") return business.offers_booking;
        if (category.behavior === "featured")
          return business.plan === "premium" || launchPartnerIds.has(business.id);
        if (category.behavior === "nearby") return false;
        return (
          business.category === category.value ||
          (business.categories ?? []).includes(category.value)
        );
      }).length,
    }));
  });

export const upsertPlaceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CategoryInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      slug: data.slug,
      name_ar: data.name_ar,
      name_en: data.name_en,
      description_ar: data.description_ar,
      description_en: data.description_en,
      level: data.level,
      behavior: data.behavior,
      icon: data.icon,
      visible: data.visible,
      sort_order: data.sort_order,
    };

    const query = data.id
      ? context.supabase.from("place_categories").update(payload).eq("id", data.id)
      : context.supabase.from("place_categories").insert({
          ...payload,
          value: `cf_${data.slug}`,
        });
    const { data: row, error } = await query.select().single();
    if (error) {
      if (error.code === "23505") throw new Error("الرابط مستخدم لتصنيف آخر. اختر رابطًا مختلفًا.");
      throw new Error(error.message);
    }
    return row;
  });

export const deletePlaceCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: category, error: categoryError } = await context.supabase
      .from("place_categories")
      .select("value,name_ar,behavior")
      .eq("id", data.id)
      .single();
    if (categoryError) throw new Error(categoryError.message);

    if (category.behavior !== "featured" && category.behavior !== "nearby") {
      const { data: businesses, error: businessError } = await context.supabase
        .from("businesses")
        .select("id,category,categories,offers_booking");
      if (businessError) throw new Error(businessError.message);
      const used = (businesses ?? []).some((business) =>
        category.behavior === "booking"
          ? business.offers_booking
          : business.category === category.value ||
            (business.categories ?? []).includes(category.value),
      );
      if (used) {
        throw new Error(
          `لا يمكن حذف «${category.name_ar}» لأنه مرتبط بأعمال. أزل التصنيف منها أولاً، أو أخفه مؤقتًا.`,
        );
      }
    }

    const { error } = await context.supabase.from("place_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
