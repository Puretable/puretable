import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, publicClient } from "@/lib/businesses.server";

export const FAQ_QUERY_KEY = ["faqs"] as const;

const FaqInput = z.object({
  id: z.string().uuid().optional(),
  question_ar: z.string().trim().min(2).max(300),
  answer_ar: z.string().trim().min(2).max(4000),
  question_en: z.string().trim().max(300).default(""),
  answer_en: z.string().trim().max(4000).default(""),
  visible: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).default(0),
});

export type Faq = z.infer<typeof FaqInput> & {
  id: string;
  created_at: string;
  updated_at: string;
};

export const listFaqs = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("faqs")
    .select(
      "id,question_ar,answer_ar,question_en,answer_en,visible,sort_order,created_at,updated_at",
    )
    .eq("visible", true)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as Faq[];
});

export const adminListFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("faqs")
      .select("*")
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as Faq[];
  });

export const upsertFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => FaqInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const payload = {
      question_ar: data.question_ar,
      answer_ar: data.answer_ar,
      question_en: data.question_en,
      answer_en: data.answer_en,
      visible: data.visible,
      sort_order: data.sort_order,
    };
    const query = data.id
      ? context.supabase.from("faqs").update(payload).eq("id", data.id)
      : context.supabase.from("faqs").insert(payload);
    const { data: faq, error } = await query.select().single();
    if (error) throw new Error(error.message);
    return faq;
  });

export const deleteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("faqs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
