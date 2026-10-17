import { useTranslation } from "react-i18next";
import { Globe, Instagram, Mail, MapPin, Music2, Phone, MessageCircle } from "lucide-react";
import { goHref } from "@/lib/track";

type IconButton = {
  key: string;
  href: string;
  icon: typeof Phone;
  ar: string;
  en: string;
  platform: string;
  eventType: string;
};

/**
 * A single row of small, square, icon-only contact buttons. Shows only what the business filled
 * in. WhatsApp appears here ONLY when the branch's WhatsApp-orders toggle is off (otherwise it's
 * the large order button in the ordering box instead — never both, see hasWhatsappOrders).
 */
export function ContactIconsRow({
  businessSlug,
  mapsHref,
  website,
  instagram,
  tiktok,
  phone,
  email,
  whatsappNumber,
  hasWhatsappOrders,
}: {
  businessSlug: string;
  mapsHref?: string | null;
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsappNumber?: string | null;
  /** When true, WhatsApp is the ordering box's big button instead of a plain icon here. */
  hasWhatsappOrders: boolean;
}) {
  const { t } = useTranslation();
  const tracked = (to: string, type: string, platform: string) =>
    goHref({ to, type, business: businessSlug, platform });

  const buttons: IconButton[] = [];
  if (mapsHref)
    buttons.push({
      key: "maps",
      href: mapsHref,
      icon: MapPin,
      ar: "الموقع على الخريطة",
      en: "Location",
      platform: "maps",
      eventType: "click_maps",
    });
  if (website)
    buttons.push({
      key: "website",
      href: tracked(website, "click_website", "website"),
      icon: Globe,
      ar: "الموقع الإلكتروني",
      en: "Website",
      platform: "website",
      eventType: "click_website",
    });
  if (instagram)
    buttons.push({
      key: "instagram",
      href: tracked(instagram, "click_social", "instagram"),
      icon: Instagram,
      ar: "إنستغرام",
      en: "Instagram",
      platform: "instagram",
      eventType: "click_social",
    });
  if (tiktok)
    buttons.push({
      key: "tiktok",
      href: tracked(tiktok, "click_social", "tiktok"),
      icon: Music2,
      ar: "تيك توك",
      en: "TikTok",
      platform: "tiktok",
      eventType: "click_social",
    });
  if (phone)
    buttons.push({
      key: "phone",
      href: tracked(`tel:${phone.replace(/\s/g, "")}`, "click_phone", "phone"),
      icon: Phone,
      ar: "اتصل الآن",
      en: "Call",
      platform: "phone",
      eventType: "click_phone",
    });
  if (email)
    buttons.push({
      key: "email",
      href: `mailto:${email}`,
      icon: Mail,
      ar: "البريد الإلكتروني",
      en: "Email",
      platform: "email",
      eventType: "click_link",
    });
  if (whatsappNumber && !hasWhatsappOrders)
    buttons.push({
      key: "whatsapp",
      href: tracked(
        `https://wa.me/${whatsappNumber.replace(/[^\d]/g, "")}`,
        "click_whatsapp",
        "whatsapp",
      ),
      icon: MessageCircle,
      ar: "واتساب",
      en: "WhatsApp",
      platform: "whatsapp",
      eventType: "click_whatsapp",
    });

  if (buttons.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("business.contact_booking")}>
      {buttons.map(({ key, href, icon: Icon, ar, en }) => (
        <a
          key={key}
          href={href}
          target={href.startsWith("tel:") || href.startsWith("mailto:") ? undefined : "_blank"}
          rel="noreferrer noopener"
          title={`${ar} / ${en}`}
          aria-label={`${ar} / ${en}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card text-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
