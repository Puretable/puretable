import { z } from "zod";
import { extractUrl } from "./link-url";

/**
 * Shared validation/normalization for the 7 fixed contact-button types (website, maps, phone,
 * whatsapp, instagram, tiktok, email), used by both the owner portal and the admin page so the two
 * never drift. Untrusted input in both cases (owners are not trusted; admin input still lands in
 * page metadata and structured data, so the same hardening applies).
 */

const PLAIN = /^[^<>]*$/;
const NO_ANGLE_BRACKETS = "الرموز < و > غير مسموحة";
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

function toHttpsUrl(value: string): string | null {
  const found = extractUrl(value);
  if (!found) return null;
  try {
    const url = new URL(found);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Saudi/international phone number, normalized to "+<country><digits>". */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  let intl = digits;
  if (intl.startsWith("00")) intl = intl.slice(2);
  else if (intl.startsWith("0")) intl = "966" + intl.slice(1);
  else if (!intl.startsWith("966") && intl.length <= 10) intl = "966" + intl;
  return `+${intl}`;
}

function normalizeHandleUrl(value: string, domain: string, handlePrefix = ""): string | null {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (
        !url.hostname
          .toLowerCase()
          .replace(/^www\./, "")
          .includes(domain)
      )
        return null;
      const path = url.pathname.replace(/\/+$/, "");
      if (!path || path === "/") return null;
      return `https://${domain}${path}`;
    } catch {
      return null;
    }
  }
  const handle = trimmed.replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return `https://${domain}/${handlePrefix}${handle}`;
}

/** https:// only (javascript:, data: and every other scheme are rejected by construction). */
export const httpsUrlField = (max = 2000) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(max)
      .regex(PLAIN, NO_ANGLE_BRACKETS)
      .transform((v, ctx) => {
        const url = toHttpsUrl(v);
        if (!url) {
          ctx.addIssue({ code: "custom", message: "الرابط غير صالح — يجب أن يبدأ بـ https://" });
          return z.NEVER;
        }
        return url;
      })
      .nullable()
      .optional(),
  );

export const phoneField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(40)
    .regex(PLAIN, NO_ANGLE_BRACKETS)
    .transform((v, ctx) => {
      const n = normalizePhone(v);
      if (!n) {
        ctx.addIssue({ code: "custom", message: "رقم الهاتف غير صالح" });
        return z.NEVER;
      }
      return n;
    })
    .nullable()
    .optional(),
);

export const emailField = z.preprocess(
  emptyToNull,
  z.string().trim().max(255).email("بريد إلكتروني غير صالح").nullable().optional(),
);

export const instagramField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300)
    .regex(PLAIN, NO_ANGLE_BRACKETS)
    .transform((v, ctx) => {
      const url = normalizeHandleUrl(v, "instagram.com");
      if (!url) {
        ctx.addIssue({ code: "custom", message: "حساب إنستغرام غير صالح" });
        return z.NEVER;
      }
      return url;
    })
    .nullable()
    .optional(),
);

export const tiktokField = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .max(300)
    .regex(PLAIN, NO_ANGLE_BRACKETS)
    .transform((v, ctx) => {
      const url = normalizeHandleUrl(v, "tiktok.com", "@");
      if (!url) {
        ctx.addIssue({ code: "custom", message: "حساب تيك توك غير صالح" });
        return z.NEVER;
      }
      return url;
    })
    .nullable()
    .optional(),
);
