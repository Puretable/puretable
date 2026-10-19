import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isFeatured } from "@/lib/services";

describe("featured places", () => {
  test("Free plan is not featured", () => {
    assert.equal(isFeatured({ plan: "free" }), false);
  });

  test("active Premium is featured", () => {
    assert.equal(isFeatured({ plan: "premium" }), true);
  });

  test("a launch partner is featured without Premium", () => {
    assert.equal(isFeatured({ plan: "free", isLaunchPartner: true }), true);
  });

  test("Premium plus launch partner is still featured", () => {
    assert.equal(isFeatured({ plan: "premium", isLaunchPartner: true }), true);
  });

  test("a reverted (expired/suspended) plan loses featured status unless it's a launch partner", () => {
    // Suspension/expiry resets the stored `plan` column back to "free" (admin_suspend_business_access),
    // so featured status is derived automatically — nothing extra to check here.
    assert.equal(isFeatured({ plan: "free", isLaunchPartner: false }), false);
  });
});
