import type { MenuItem, MenuSafety } from "./owner-manage.schemas";

/**
 * Menu items reuse the site's existing three-colour safety system (same colour tokens and the same
 * labels as the business-level badges), so nothing new is introduced for visitors to learn:
 *   green  = dedicated gluten-free,
 *   orange = shared kitchen, precautions taken,
 *   red    = gluten-free option, confirm with the staff first.
 */
export const MENU_SAFETY_STYLE: Record<
  MenuSafety,
  { dot: string; border: string; text: string; labelKey: string }
> = {
  green: {
    dot: "bg-safety-safe",
    border: "border-safety-safe/40",
    text: "text-safety-safe",
    labelKey: "safety.safe_label",
  },
  orange: {
    dot: "bg-safety-shared",
    border: "border-safety-shared/40",
    text: "text-safety-shared",
    labelKey: "safety.shared_label",
  },
  red: {
    dot: "bg-safety-caution",
    border: "border-safety-caution/40",
    text: "text-safety-caution",
    labelKey: "safety.caution_label",
  },
};

export function formatMenuPrice(item: Pick<MenuItem, "price" | "currency">, lang: string): string {
  if (item.price === null || item.price === undefined) return "";
  const amount = Number(item.price).toLocaleString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return lang === "ar" ? `${amount} ر.س` : `${amount} ${item.currency || "SAR"}`;
}
