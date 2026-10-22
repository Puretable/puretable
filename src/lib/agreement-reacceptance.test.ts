import assert from "node:assert/strict";
import { test } from "node:test";
import { isV1ToV2Reacceptance } from "./agreement-reacceptance";

test("an existing v1 owner re-prompted for v2 sees the notice", () => {
  assert.equal(isV1ToV2Reacceptance("v1", "v2"), true);
});

test("a new owner with no prior acceptance never sees the notice", () => {
  assert.equal(isV1ToV2Reacceptance(null, "v2"), false);
});

test("a business already on v2 does not see the notice (re-rendered defensively)", () => {
  assert.equal(isV1ToV2Reacceptance("v2", "v2"), false);
});

test("a simulated future v2 -> v3 transition never shows the v1->v2 notice", () => {
  assert.equal(isV1ToV2Reacceptance("v2", "v3"), false);
});

test("a v1 owner is not shown the notice while the required version is still v1", () => {
  assert.equal(isV1ToV2Reacceptance("v1", "v1"), false);
});
