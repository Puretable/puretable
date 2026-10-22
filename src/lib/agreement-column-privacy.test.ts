import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * businesses.terms_accepted_at / terms_version are the owner's private agreement-signing record.
 * The public (anon) column list must never include them — the public business page and the public
 * MCP get_gluten_free_place tool both select PUBLIC_BUSINESS_COLUMNS, and the MCP tool spreads the
 * whole row into its response, so an accidental re-add here is a real leak, not just dead weight.
 * The authenticated list must keep them — the owner portal's agreement gate and admin billing page
 * both rely on AUTHENTICATED_BUSINESS_COLUMNS to read a business's own agreement status.
 *
 * This reads the source as text (rather than importing the module) because businesses.server.ts
 * transitively imports image assets via @/data/businesses, which only Vite can resolve — see that
 * file's own comment. Plain text/regex matching is the same approach column-grant-safety.test.ts
 * already uses for this reason.
 */
const SOURCE = readFileSync(
  join(import.meta.dirname, "businesses.server.ts"),
  "utf8",
);

function constantValue(name: string): string {
  const re = new RegExp(`${name}\\s*=\\s*\`?"?([^\`"\\n]*)`);
  const match = SOURCE.match(re);
  assert.ok(match, `could not find constant ${name} in businesses.server.ts`);
  return match[1];
}

test("PUBLIC_BUSINESS_COLUMNS excludes the agreement columns", () => {
  const value = constantValue("export const PUBLIC_BUSINESS_COLUMNS");
  assert.ok(
    !/terms_accepted_at|terms_version/.test(value),
    "PUBLIC_BUSINESS_COLUMNS must never select terms_accepted_at/terms_version — anon has no grant on them",
  );
});

test("AUTHENTICATED_BUSINESS_COLUMNS still includes the agreement columns", () => {
  const value = constantValue("export const AUTHENTICATED_BUSINESS_COLUMNS");
  assert.ok(
    /terms_accepted_at/.test(value) && /terms_version/.test(value),
    "AUTHENTICATED_BUSINESS_COLUMNS must keep terms_accepted_at/terms_version for the owner portal and admin",
  );
});
