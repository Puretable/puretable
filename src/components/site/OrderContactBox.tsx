import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Package, Plus, Truck } from "lucide-react";
import { goHref } from "@/lib/track";
import { composeOrderMessage, shouldShowOrderButton, whatsappHref } from "@/lib/contact";
import type { MenuItem } from "@/lib/owner-manage.schemas";

/**
 * Ordering box — shown only when this branch has pickup and/or delivery enabled. Never rendered
 * otherwise (no empty or misleading boxes). Each enabled option is its own button that opens
 * WhatsApp directly: there is no separate "order via WhatsApp" button and no delivery-link button —
 * pickup and delivery both go through the same WhatsApp chat, with the chosen method folded into
 * the pre-filled greeting (WHATSAPP_INQUIRY_MESSAGE, see contact.ts), along with any selected menu
 * items. No selection is stored anywhere: it only exists in this component's state, folded into the
 * WhatsApp message text at the moment the visitor opens the chat.
 */
export function OrderContactBox({
  businessSlug,
  whatsappNumber,
  pickupEnabled,
  deliveryEnabled,
  menuItems,
  lang,
}: {
  businessSlug: string;
  /** null when there is no number, or the business's plan does not show it. */
  whatsappNumber: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  menuItems: MenuItem[];
  lang: string;
}) {
  const { t } = useTranslation();
  if (!pickupEnabled && !deliveryEnabled) return null;

  return (
    <OrderContactBoxInner
      businessSlug={businessSlug}
      whatsappNumber={whatsappNumber}
      pickupEnabled={pickupEnabled}
      deliveryEnabled={deliveryEnabled}
      menuItems={menuItems}
      lang={lang}
      t={t}
    />
  );
}

function OrderContactBoxInner({
  businessSlug,
  whatsappNumber,
  pickupEnabled,
  deliveryEnabled,
  menuItems,
  lang,
  t,
}: {
  businessSlug: string;
  whatsappNumber: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  menuItems: MenuItem[];
  lang: string;
  t: (key: string) => string;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});

  function toggleItem(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[id] = 1;
      else delete next[id];
      return next;
    });
  }
  function changeQty(id: string, delta: number) {
    setSelected((prev) => ({ ...prev, [id]: Math.max(1, (prev[id] ?? 1) + delta) }));
  }

  function composeMessage(method: "pickup" | "delivery"): string {
    const itemLines = menuItems
      .filter((item) => selected[item.id])
      .map((item) => {
        const name = lang === "ar" ? item.name_ar || item.name : item.name;
        return `- ${name} ×${selected[item.id]}`;
      });
    return composeOrderMessage({
      orderMethodLabel: t("business.order_method_label"),
      methodLabel: t(method === "pickup" ? "business.pickup_choice" : "business.delivery_choice"),
      itemsLabel: t("business.items_label"),
      items: itemLines,
    });
  }

  function waTrackedHref(method: "pickup" | "delivery"): string | null {
    const href = whatsappNumber ? whatsappHref(whatsappNumber, composeMessage(method)) : null;
    return href
      ? goHref({ to: href, type: "click_whatsapp", business: businessSlug, platform: "whatsapp" })
      : null;
  }

  const pickupHref = shouldShowOrderButton(pickupEnabled, whatsappNumber)
    ? waTrackedHref("pickup")
    : null;
  const deliveryHref = shouldShowOrderButton(deliveryEnabled, whatsappNumber)
    ? waTrackedHref("delivery")
    : null;

  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-5">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("business.contact_booking")}
      </h3>

      {(pickupEnabled || deliveryEnabled) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pickupEnabled && (
            <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
              {t("business.pickup_available")}
            </span>
          )}
          {deliveryEnabled && (
            <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary">
              {t("business.delivery_available")}
            </span>
          )}
        </div>
      )}

      {whatsappNumber && menuItems.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{t("business.menu_select_hint")}</p>
          <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pe-1">
            {menuItems.map((item) => {
              const name = lang === "ar" ? item.name_ar || item.name : item.name;
              const qty = selected[item.id] ?? 0;
              return (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={qty > 0}
                      onChange={(e) => toggleItem(item.id, e.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="truncate">{name}</span>
                  </label>
                  {qty > 0 && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`-1 ${name}`}
                        onClick={() => changeQty(item.id, -1)}
                        className="grid h-6 w-6 place-items-center rounded-full border border-border"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs" aria-label={t("business.qty")}>
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`+1 ${name}`}
                        onClick={() => changeQty(item.id, 1)}
                        className="grid h-6 w-6 place-items-center rounded-full border border-border"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {pickupHref && (
          <a
            href={pickupHref}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Package className="h-4 w-4" />
            {t("business.pickup_choice")}
          </a>
        )}
        {deliveryHref && (
          <a
            href={deliveryHref}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-center gap-2 rounded-full border border-primary bg-card px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary-soft"
          >
            <Truck className="h-4 w-4" />
            {t("business.delivery_choice")}
          </a>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t("business.order_note")}</p>
    </div>
  );
}
