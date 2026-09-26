import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PLAN_FEATURES,
  PLAN_TIERS,
  branchLimitLabel,
  planOf,
  remainingBranchSlots,
} from "@/lib/plans";

describe("subscription plan rules", () => {
  test("exposes only the three supported packages", () => {
    assert.deepEqual(PLAN_TIERS, ["free", "pro", "premium"]);
  });

  test("keeps Family as legacy input only and maps it to Pro", () => {
    assert.equal(planOf({ plan: "family" }), "pro");
    assert.equal(planOf({ plan: "Family" }), "pro");
  });

  test("enforces the agreed branch allowances", () => {
    assert.equal(PLAN_FEATURES.free.branchLimit, 1);
    assert.equal(PLAN_FEATURES.pro.branchLimit, 3);
    assert.equal(PLAN_FEATURES.premium.branchLimit, null);
    assert.equal(remainingBranchSlots("free", 1), 0);
    assert.equal(remainingBranchSlots("pro", 1), 2);
    assert.equal(remainingBranchSlots("premium", 200), null);
    assert.equal(branchLimitLabel("premium"), "غير محدود");
  });
});

test("gluten-free menu items are Pro and Premium only", async () => {
  const { canUseMenu } = await import("./plans");
  assert.equal(canUseMenu({ plan: "free" }), false);
  assert.equal(canUseMenu(null), false);
  assert.equal(canUseMenu({ plan: "pro" }), true);
  assert.equal(canUseMenu({ plan: "premium" }), true);
});
