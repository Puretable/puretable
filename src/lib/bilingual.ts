/**
 * Shared "one box per field" helper. Several forms (business info, branches, menu items) used to
 * show a separate Arabic and English input per field, writing to two separate database columns.
 * They now show a single box: prefilled from whichever language already has text (Arabic first,
 * see pickBilingual), and on save the same text is written to both columns (see mirrorBilingual),
 * so the two columns can never go stale or mismatched again.
 */

/** What a single combined box should show when first opened: Arabic first, falling back to English. */
export function pickBilingual(ar: string | null | undefined, en: string | null | undefined): string {
  return ar?.trim() ? ar : (en ?? "");
}

/** What to write on save: the same text in both the plain and the `_ar` column. */
export function mirrorBilingual(value: string): { primary: string; ar: string } {
  return { primary: value, ar: value };
}
