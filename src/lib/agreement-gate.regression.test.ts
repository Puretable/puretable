import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../supabase/migrations");

/** The function's current definition: the LAST `create or replace` for it, in migration order. */
function latestFunctionBody(fnName: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const re = new RegExp(
    `create or replace function public\\.${fnName}\\([^)]*\\)[\\s\\S]*?\\$\\$;`,
    "g",
  );
  let body = "";
  for (const file of files) {
    const matches = readFileSync(join(MIGRATIONS_DIR, file), "utf8").match(re);
    if (matches) body = matches[matches.length - 1]!;
  }
  if (!body) throw new Error(`function ${fnName} not found in any migration`);
  return body;
}

test("accept_partnership_agreement never re-requires billing data before the first-login gate", () => {
  // Regression guard for a real production incident (2026-10-15): a migration that repointed
  // billing reads at the new business_billing table accidentally added a check requiring billing
  // data to already exist before the agreement could be accepted. Billing info is filled in AFTER
  // the agreement in every real flow (see AgreementGate.tsx and portal.tsx), so that check always
  // failed and blocked every owner at first login, with no workaround. The billing-completeness
  // gate belongs only in request_business_plan (paid-plan upgrades) — never here.
  const body = latestFunctionBody("accept_partnership_agreement");
  assert.doesNotMatch(
    body,
    /business_billing/,
    "accept_partnership_agreement must not depend on business_billing. Re-adding this locks every new owner out of the portal at first login.",
  );
});
