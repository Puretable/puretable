/**
 * True only for the exact v1 -> v2 re-acceptance transition: the business's last accepted version
 * was "v1" and the version now required is "v2". Used by AgreementGate to show a short "nothing in
 * the terms changed" notice above the agreement text for that transition only.
 *
 * Never true for a business with no prior acceptance (businessTermsVersion null — a new owner),
 * never for v2 -> v3 or any later transition, and never once the business is already on v2. No
 * business-id list: a pure version-string comparison, so this keeps working unmodified for this one
 * transition and stops applying on its own once the required version moves past "v2".
 *
 * Takes both versions as plain arguments (rather than importing AGREEMENT_TERMS_VERSION itself) so
 * it stays a pure function, trivial to unit-test for every transition without needing to mock a
 * module-level constant.
 */
export function isV1ToV2Reacceptance(
  businessTermsVersion: string | null,
  currentRequiredVersion: string,
): boolean {
  return businessTermsVersion === "v1" && currentRequiredVersion === "v2";
}
