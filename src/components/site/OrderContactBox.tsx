import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Phone, MapPin, Instagram, MessageCircle, Music2, Minus, Plus } from "lucide-react";
import { goHref } from "@/lib/track";
import { WHATSAPP_INQUIRY_MESSAGE, whatsappHref } from "@/lib/contact";
import type { MenuItem } from "@/lib/owner-manage.schemas";

/**
 * Consolidated contact/order box. The pre-filled WhatsApp greeting
 * (WHATSAPP_INQUIRY_MESSAGE, see contact.ts) is never changed here — the chosen method, any
 * selected menu items, and a confirm-with-establishment line are only ever appended to it.
 * No selection is stored anywhere: it only exists in this component's state, folded into the
 * WhatsApp message text at the moment the visitor opens the chat.
 */
export function OrderContactBox({
  businessSlug,
  whatsappNumber,
  phone,
  mapsHref,
  instagramUrl,
  tiktokUrl,
  pickupEnabled,
  deliveryEnabled,
  menuItems,
  lang,
}: {
  businessSlug: string;
  /** null when there is no number, or the business's plan does not show it. */
  whatsappNumber: string | null;
  phone: string | null;
  mapsHref: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  menuItems: MenuItem[];
  lang: string;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<"pickup" | "delivery" | null>(
    pickupEnabled && !deliveryEnabled
      ? "pickup"
      : deliveryEnabled && !pickupEnabled
        ? "delivery"
        : null,
  );
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

  function composeMessage(): string {
    const lines = [WHATSAPP_INQUIRY_MESSAGE];
    if (method) {
      const methodLabel = t(
        method === "pickup" ? "business.pickup_choice" : "business.delivery_choice",
      );
      lines.push(`${t("business.order_method_label")}: ${methodLabel}`);
    }
    const itemLines = menuItems
      .filter((item) => selected[item.id])
      .map((item) => {
        const name = lang === "ar" ? item.name_ar || item.name : item.name;
        return `- ${name} ×${selected[item.id]}`;
      });
    if (itemLines.length) {
      lines.push(`${t("business.items_label")}:`);
      lines.push(...itemLines);
    }
    return lines.join("\n");
  }

  const waHref = whatsappNumber ? whatsappHref(whatsappNumber, composeMessage()) : null;
  const waTrackedHref = waHref
    ? goHref({ to: waHref, type: "click_whatsapp", business: businessSlug, platform: "whatsapp" })
    : null;
  const callTrackedHref = phone
    ? goHref({
        to: `tel:${phone.replace(/\s/g, "")}`,
        type: "click_phone",
        business: businessSlug,
        platform: "phone",
      })
    : null;
  const tiktokTrackedHref = tiktokUrl
    ? goHref({ to: tiktokUrl, type: "click_social", business: businessSlug, platform: "tiktok" })
    : null;

  const primaryHref = waTrackedHref ?? callTrackedHref;
  const primaryIsWhatsapp = !!waTrackedHref;
  const showCallAsSecondary = primaryIsWhatsapp && !!callTrackedHref;

  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-5">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("business.contact_booking")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("business.order_note")}</p>

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

      {menuItems.length > 0 && (
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

      {pickupEnabled && deliveryEnabled && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{t("business.choose_method")}</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              aria-pressed={method === "pickup"}
              onClick={() => setMethod("pickup")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                method === "pickup"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {t("business.pickup_choice")}
            </button>
            <button
              type="button"
              aria-pressed={method === "delivery"}
              onClick={() => setMethod("delivery")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                method === "delivery"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {t("business.delivery_choice")}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {primaryHref && (
          <a
            href={primaryHref}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {primaryIsWhatsapp ? (
              <MessageCircle className="h-4 w-4" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            {primaryIsWhatsapp ? t("business.order_via_whatsapp") : t("business.call_now")}
          </a>
        )}

        <div className="flex flex-wrap gap-2">
          {showCallAsSecondary && (
            <a
              href={callTrackedHref!}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
            >
              <Phone className="h-3.5 w-3.5" /> {t("business.call_now")}
            </a>
          )}
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
            >
              <MapPin className="h-3.5 w-3.5" /> {t("business.open_in_maps")}
            </a>
          )}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
            >
              <Instagram className="h-3.5 w-3.5" /> Instagram
            </a>
          )}
          {tiktokTrackedHref && (
            <a
              href={tiktokTrackedHref}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary/40 hover:text-primary"
            >
              <Music2 className="h-3.5 w-3.5" /> TikTok
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
