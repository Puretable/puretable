/**
 * Contact helpers shared by the public site.
 * Everything here is data-driven: an empty value returns null so the caller can
 * skip rendering the button entirely (no empty icons or broken links).
 */

/**
 * The message every business WhatsApp button opens the chat with. One wording for all visitors and
 * both site languages, so it is easy to recognise and count on the business side.
 */
export const WHATSAPP_INQUIRY_MESSAGE =
  "أهلًا، وصلت لكم عن طريق Pure Table وأرغب بالاستفسار عن الخيارات الخالية من الجلوتين.";

/**
 * Percent-encode a chat message for a WhatsApp link.
 *
 * `encodeURIComponent` (and URLSearchParams) leave . ! ' ( ) * as they are, but the tracked
 * redirect (/go) trims trailing punctuation from pasted links, which would silently drop the final
 * full stop of a message. Encoding those characters too keeps the text exactly as written.
 */
export function encodeWhatsappText(message: string): string {
  return encodeURIComponent(message).replace(
    /[.!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

/** Turn a WhatsApp number or pasted link into a chat URL, optionally with a ready message. */
export function whatsappHref(
  value: string | null | undefined,
  message?: string | null,
): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (!message) return url.toString();
      // A message we supply replaces any text the saved link already carried.
      url.searchParams.delete("text");
      const base = url.toString();
      return `${base}${base.includes("?") ? "&" : "?"}text=${encodeWhatsappText(message)}`;
    } catch {
      return null;
    }
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  // Saudi local numbers (05…) are normalised to the international form.
  const intl = digits.startsWith("00")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? `966${digits.slice(1)}`
      : digits;
  const base = `https://wa.me/${intl}`;
  return message ? `${base}?text=${encodeWhatsappText(message)}` : base;
}

/** The pre-filled message for business WhatsApp buttons (same in Arabic and English). */
export function pureTableWhatsAppMessage() {
  return WHATSAPP_INQUIRY_MESSAGE;
}

/** Add first-party referral attribution without replacing existing query parameters. */
export function withPureTableUtm(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    url.searchParams.set("utm_source", "pure_table");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "business_profile");
    return url.toString();
  } catch {
    return value;
  }
}

/** Instagram handle or full URL → profile URL. */
export function instagramHref(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://instagram.com/${raw.replace(/^@/, "")}`;
}

/** TikTok handle or full URL → profile URL. */
export function tiktokHref(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.tiktok.com/@${raw.replace(/^@/, "")}`;
}

/** Email → mailto link. */
export function emailHref(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw || !raw.includes("@")) return null;
  return `mailto:${raw}`;
}
