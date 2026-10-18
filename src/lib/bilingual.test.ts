import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pickBilingual, mirrorBilingual } from "@/lib/bilingual";

describe("one box per bilingual field", () => {
  test("prefers the Arabic column when it has text", () => {
    assert.equal(pickBilingual("مقهى تجربة", "Test Cafe"), "مقهى تجربة");
  });

  test("falls back to the other column when Arabic is empty", () => {
    assert.equal(pickBilingual("", "Test Cafe"), "Test Cafe");
    assert.equal(pickBilingual(null, "Test Cafe"), "Test Cafe");
    assert.equal(pickBilingual(undefined, "Test Cafe"), "Test Cafe");
    assert.equal(pickBilingual("   ", "Test Cafe"), "Test Cafe");
  });

  test("falls back to empty string when neither column has text", () => {
    assert.equal(pickBilingual(null, null), "");
    assert.equal(pickBilingual(undefined, undefined), "");
  });

  test("mirrors a single value into both columns on save", () => {
    assert.deepEqual(mirrorBilingual("مقهى تجربة"), { primary: "مقهى تجربة", ar: "مقهى تجربة" });
    assert.deepEqual(mirrorBilingual("Test Cafe"), { primary: "Test Cafe", ar: "Test Cafe" });
  });
});
