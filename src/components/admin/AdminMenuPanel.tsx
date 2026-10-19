import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DiscountCodeEditor, MenuManager } from "@/components/portal/MenuManager";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteMenuItemFn,
  saveDiscountCodeFn,
  saveMenuItemFn,
  signBusinessUpload,
} from "@/lib/owner-manage.functions";
import type { MenuItem, MenuItemInput } from "@/lib/owner-manage.schemas";

/**
 * Admin view of a business's gluten-free menu. It is the same editor owners use; admins may always
 * edit (even while an owner's access is suspended), and the server still authorises every call.
 * The discount code (moved out of the main business form) is shown below it, same as the owner
 * portal's menu tab.
 */
export function AdminMenuPanel({
  businessId,
  discountCode,
}: {
  businessId: string;
  discountCode: string | null;
}) {
  const qc = useQueryClient();
  const saveItem = useServerFn(saveMenuItemFn);
  const removeItem = useServerFn(deleteMenuItemFn);
  const sign = useServerFn(signBusinessUpload);
  const saveDiscount = useServerFn(saveDiscountCodeFn);
  const items = useQuery({
    queryKey: ["admin-menu-items", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_menu_items" as never)
        .select(
          "id,business_id,name,name_ar,description,description_ar,price,currency,photo_url,safety,sort_order",
        )
        .eq("business_id", businessId)
        .order("sort_order")
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MenuItem[];
    },
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-menu-items", businessId] }),
      qc.invalidateQueries({ queryKey: ["business"] }),
      qc.invalidateQueries({ queryKey: ["owner-business", businessId] }),
    ]);
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        قائمة الطعام الخالية من الجلوتين / Gluten-free menu
      </h2>
      {items.isLoading ? (
        <p role="status">جارٍ التحميل…</p>
      ) : items.isError ? (
        <p role="alert" className="text-sm text-destructive">
          تعذر تحميل القائمة.
        </p>
      ) : (
        <MenuManager
          businessId={businessId}
          items={items.data ?? []}
          save={async (input: MenuItemInput) => {
            await saveItem({ data: input });
            await refresh();
          }}
          remove={async (id) => {
            await removeItem({ data: { businessId, id } });
            await refresh();
          }}
          sign={(filename) => sign({ data: { businessId, filename } })}
        />
      )}
      <div className="mt-4">
        <DiscountCodeEditor
          discountCode={discountCode}
          save={async (code) => {
            await saveDiscount({ data: { business_id: businessId, discount_code: code } });
            await refresh();
          }}
        />
      </div>
    </section>
  );
}
