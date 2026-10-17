import { ContactIconsRow } from "@/components/site/ContactIconsRow";
import { OrderContactBox } from "@/components/site/OrderContactBox";
import type { MenuItem } from "@/lib/owner-manage.schemas";
import type { OwnerBranchRow, OwnerBusinessDetail } from "@/lib/owner-manage.schemas";

/**
 * Exactly what a visitor will see, reusing the same components as the public page — updates right
 * after any save (business contact, branch fields) via the parent's refetch, no page reload needed.
 */
export function ContactOrderingPreview({
  business,
  branches,
}: {
  business: OwnerBusinessDetail;
  branches: OwnerBranchRow[];
}) {
  const menuItems = business.business_menu_items as unknown as MenuItem[];
  const singleBranch = branches.length <= 1 ? (branches[0] ?? null) : null;
  const multi = branches.length > 1;

  return (
    <div dir="rtl" className="mt-3 space-y-4 rounded-2xl border border-dashed bg-secondary/20 p-4">
      <div className="max-w-sm space-y-3">
        <ContactIconsRow
          businessSlug={business.slug}
          mapsHref={multi ? null : (singleBranch?.maps_url ?? null)}
          website={business.website}
          instagram={business.instagram}
          tiktok={business.tiktok}
          email={business.email}
          phone={multi ? null : (singleBranch?.phone ?? null)}
          whatsappNumber={multi ? null : (singleBranch?.whatsapp ?? null)}
          hasWhatsappOrders={multi ? false : !!singleBranch?.whatsapp_orders_enabled}
        />
        {!multi && (
          <OrderContactBox
            businessSlug={business.slug}
            whatsappNumber={singleBranch?.whatsapp ?? null}
            whatsappOrdersEnabled={!!singleBranch?.whatsapp_orders_enabled}
            deliveryUrl={singleBranch?.delivery_url ?? null}
            pickupEnabled={!!singleBranch?.pickup_enabled}
            deliveryEnabled={!!singleBranch?.delivery_enabled}
            menuItems={menuItems}
            lang="ar"
          />
        )}
        {!multi && !singleBranch && (
          <p className="text-xs text-muted-foreground">
            أضف فرعاً من تبويب «الفروع» ليظهر هنا هاتفك وواتساب ومابس وخيارات الاستلام/التوصيل.
          </p>
        )}
      </div>

      {multi && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">لكل فرع صندوقه الخاص في صفحتك العامة:</p>
          {branches.map((br) => (
            <div key={br.id} className="max-w-sm space-y-2 rounded-xl border bg-card p-3">
              <p className="text-xs font-medium">{br.name_ar || br.name}</p>
              <ContactIconsRow
                businessSlug={business.slug}
                mapsHref={br.maps_url}
                phone={br.phone}
                whatsappNumber={br.whatsapp}
                hasWhatsappOrders={!!br.whatsapp_orders_enabled}
              />
              <OrderContactBox
                businessSlug={business.slug}
                whatsappNumber={br.whatsapp}
                whatsappOrdersEnabled={!!br.whatsapp_orders_enabled}
                deliveryUrl={br.delivery_url}
                pickupEnabled={!!br.pickup_enabled}
                deliveryEnabled={!!br.delivery_enabled}
                menuItems={menuItems}
                lang="ar"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
