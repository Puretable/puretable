import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { partnershipAgreementTemplate } from "./agreement/partnership-agreement.template";
import { AGREEMENT_TERMS_VERSION } from "./owner-manage.schemas";

/**
 * The hash a business's acceptance is legally tied to (agreement_versions.text_sha256, seeded by
 * supabase/test-sync/20261019_agreement_evidence.sql) for each known terms version. If the template
 * text ever changes, this hash changes too, and this test fails — on purpose: a text change must
 * come with a NEW terms version (bump AGREEMENT_TERMS_VERSION) and a new row in agreement_versions,
 * never a silent edit of what "v1" means after someone has already accepted it.
 */
const KNOWN_VERSION_HASHES: Record<string, string> = {
  v1: "66dbc857dbd3c883b1c6c83256368fa46c0d729b16ea3f45e3ea357f88e47de7",
};

test("the live agreement template's hash matches its recorded version — a text change requires a new version", () => {
  const liveHash = createHash("sha256").update(partnershipAgreementTemplate, "utf8").digest("hex");
  const expected = KNOWN_VERSION_HASHES[AGREEMENT_TERMS_VERSION];
  assert.ok(
    expected,
    `AGREEMENT_TERMS_VERSION is "${AGREEMENT_TERMS_VERSION}", which has no recorded hash in this test. ` +
      `Add a row to KNOWN_VERSION_HASHES here AND a matching row in agreement_versions (via a new migration).`,
  );
  assert.equal(
    liveHash,
    expected,
    `The agreement template text changed (hash no longer matches "${AGREEMENT_TERMS_VERSION}"). ` +
      `Bump AGREEMENT_TERMS_VERSION to a new version, add its row to agreement_versions (new migration) ` +
      `and to KNOWN_VERSION_HASHES here — never edit what an already-accepted version's text means.`,
  );
});
