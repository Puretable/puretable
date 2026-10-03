// A plain string export, not a separate asset file read at request time — a runtime `readFileSync`
// of a sibling .html file did not survive this app's Vercel deployment, the same class of problem as
// the Chromium binary before it (static assets this bundler doesn't trace). A plain string import
// also works identically under plain Node/tsx (this repo's test scripts), unlike Vite's `?raw`.
import { partnershipAgreementTemplate as template } from "./partnership-agreement.template";

/**
 * Fills the "Second Party" and date blanks in the Partnership Agreement template.
 *
 * The template (`partnership-agreement.template.html`) is generated once from the source .docx by
 * `scripts/build-agreement-template.mjs` and never hand-edited — every word of the legal text in it
 * is exactly what was provided. This module only locates the known blank-fill anchors structurally
 * (by the fixed label text around each blank, e.g. "Commercial Registration No.: (_____)") and
 * substitutes the parenthesized placeholder with an HTML-escaped value. No other text is touched.
 */
export type AgreementFields = {
  tradeName: string;
  crNumber: string;
  taxNumber: string | null;
  address: string;
  email: string;
  representativeName: string;
  representativeTitle: string;
};

const NOT_REGISTERED_EN = "Not registered";
const NOT_REGISTERED_AR = "غير مسجلة";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hijriDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

const SECOND_PARTY_EN =
  "Second: (_____), Commercial Registration No.: (_____), Tax Number: (_____), Address: (_____), Email: (_____), represented by/in the capacity of: (_____).";
const SECOND_PARTY_AR =
  "ثانياً: ()، السجل التجاري: () الرقم الضريبي: () العنوان: () البريد الإلكتروني: () ويمثلها/ بصفته ().";
const DATE_EN = "On this day corresponding to ___ /___ /___ H, an agreement was concluded between:";
const DATE_AR = "إنه في يوم الموافق / /هـ تم الاتفاق بين كل من:";

export function fillAgreementTemplate(fields: AgreementFields, now: Date = new Date()): string {
  const tradeName = escapeHtml(fields.tradeName);
  const crNumber = escapeHtml(fields.crNumber);
  const taxNumberEn = escapeHtml(fields.taxNumber?.trim() || NOT_REGISTERED_EN);
  const taxNumberAr = escapeHtml(fields.taxNumber?.trim() || NOT_REGISTERED_AR);
  const address = escapeHtml(fields.address);
  const email = escapeHtml(fields.email);
  const repName = escapeHtml(fields.representativeName);
  const repTitle = escapeHtml(fields.representativeTitle);
  const { day, month, year } = hijriDateParts(now);

  const filledSecondPartyEn =
    `Second: (${tradeName}), Commercial Registration No.: (${crNumber}), Tax Number: (${taxNumberEn}), ` +
    `Address: (${address}), Email: (${email}), represented by/in the capacity of: (${repName} – ${repTitle}).`;
  const filledSecondPartyAr =
    `ثانياً: (${tradeName})، السجل التجاري: (${crNumber}) الرقم الضريبي: (${taxNumberAr}) ` +
    `العنوان: (${address}) البريد الإلكتروني: (${email}) ويمثلها/ بصفته (${repName} – ${repTitle}).`;
  const filledDateEn = `On this day corresponding to ${day}/${month}/${year} H, an agreement was concluded between:`;
  const filledDateAr = `إنه في يوم الموافق ${day}/${month}/${year}هـ تم الاتفاق بين كل من:`;

  if (!template.includes(SECOND_PARTY_EN) || !template.includes(SECOND_PARTY_AR)) {
    throw new Error("Agreement template is missing an expected Second Party anchor");
  }
  if (!template.includes(DATE_EN) || !template.includes(DATE_AR)) {
    throw new Error("Agreement template is missing an expected date anchor");
  }

  return template
    .replace(SECOND_PARTY_EN, filledSecondPartyEn)
    .replace(SECOND_PARTY_AR, filledSecondPartyAr)
    .replace(DATE_EN, filledDateEn)
    .replace(DATE_AR, filledDateAr);
}
