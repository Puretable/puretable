// A plain string export, not a separate asset file read at request time — a runtime `readFileSync`
// of a sibling .html file did not survive this app's Vercel deployment, the same class of problem as
// the Chromium binary before it (static assets this bundler doesn't trace). A plain string import
// also works identically under plain Node/tsx (this repo's test scripts), unlike Vite's `?raw`.
import { partnershipAgreementTemplate as template } from "./partnership-agreement.template";

/**
 * Fills the "Second Party" blanks in the Partnership Agreement template.
 *
 * The template (`partnership-agreement.template.ts`) is generated once from the source .docx by
 * `scripts/build-agreement-template.mjs` and never hand-edited — every word of the legal text in it
 * is exactly what was provided. This module only locates the known blank-fill anchor structurally
 * (by the fixed label text around each blank, e.g. "Commercial Registration No.: (_____)") and
 * substitutes the parenthesized placeholder with an HTML-escaped value. No other text is touched.
 *
 * Every field is optional: at first login (before the CR number is collected) only the business
 * name and the owner's account email are known yet, and the rest of the blanks are left exactly as
 * unfilled as they are in the source document — "_____" in the English column, empty parentheses in
 * the Arabic column — rather than guessed at.
 */
export type AgreementFields = {
  tradeName?: string | null;
  crNumber?: string | null;
  taxNumber?: string | null;
  address?: string | null;
  email?: string | null;
};

const NOT_REGISTERED_EN = "Not registered";
const NOT_REGISTERED_AR = "غير مسجلة";
const BLANK_EN = "_____";
const BLANK_AR = "";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escaped value if present, otherwise the same unfilled placeholder the source document uses. */
function fill(value: string | null | undefined, blank: string): string {
  const trimmed = value?.trim();
  return trimmed ? escapeHtml(trimmed) : blank;
}

const SECOND_PARTY_EN =
  "Second: (_____), Commercial Registration No.: (_____), Tax Number: (_____), Address: (_____), Email: (_____).";
const SECOND_PARTY_AR =
  "ثانياً: ()، السجل التجاري: () الرقم الضريبي: () العنوان: () البريد الإلكتروني: ().";

export function fillAgreementTemplate(fields: AgreementFields): string {
  const tradeName = fill(fields.tradeName, BLANK_EN);
  const tradeNameAr = fill(fields.tradeName, BLANK_AR);
  const crNumber = fill(fields.crNumber, BLANK_EN);
  const crNumberAr = fill(fields.crNumber, BLANK_AR);
  const taxNumberEn = fields.taxNumber?.trim()
    ? escapeHtml(fields.taxNumber.trim())
    : NOT_REGISTERED_EN;
  const taxNumberAr = fields.taxNumber?.trim()
    ? escapeHtml(fields.taxNumber.trim())
    : NOT_REGISTERED_AR;
  const address = fill(fields.address, BLANK_EN);
  const addressAr = fill(fields.address, BLANK_AR);
  const email = fill(fields.email, BLANK_EN);
  const emailAr = fill(fields.email, BLANK_AR);

  const filledSecondPartyEn =
    `Second: (${tradeName}), Commercial Registration No.: (${crNumber}), Tax Number: (${taxNumberEn}), ` +
    `Address: (${address}), Email: (${email}).`;
  const filledSecondPartyAr =
    `ثانياً: (${tradeNameAr})، السجل التجاري: (${crNumberAr}) الرقم الضريبي: (${taxNumberAr}) ` +
    `العنوان: (${addressAr}) البريد الإلكتروني: (${emailAr}).`;

  if (!template.includes(SECOND_PARTY_EN) || !template.includes(SECOND_PARTY_AR)) {
    throw new Error("Agreement template is missing an expected Second Party anchor");
  }

  return template
    .replace(SECOND_PARTY_EN, filledSecondPartyEn)
    .replace(SECOND_PARTY_AR, filledSecondPartyAr);
}
