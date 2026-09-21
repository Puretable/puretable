import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OTP_CODE,
  activatedCount,
  daysRemaining,
  emailSchema,
  friendlyPortalError,
  isExpiringSoon,
  ownerFeatures,
  planMove,
  type OwnerBusiness,
} from "./owner-portal";

const business = (over: Partial<OwnerBusiness> = {}): OwnerBusiness => ({
  id: "b1",
  slug: "b1",
  name: "One",
  name_ar: null,
  city: "Riyadh",
  published: true,
  plan: "free",
  cover_url: null,
  entitlements: {
    branch_limit: 1,
    photo_limit: 1,
    description_limit: 160,
    show_links: false,
    analytics: "none",
  },
  usage: {
    branches_published: 1,
    branches_hidden_by_plan: 0,
    branches_total: 1,
    photos: 3,
    links: 2,
    menu_items: 0,
  },
  current: null,
  pending: null,
  activated_count: 1,
  access_suspended: false,
  suspension_reason: null,
  ...over,
});

test("email input is normalised and validated", () => {
  assert.equal(emailSchema.parse("  Owner@Example.COM "), "owner@example.com");
  assert.equal(emailSchema.safeParse("not-an-email").success, false);
  assert.equal(emailSchema.safeParse("a@b").success, false);
});

test("otp codes are digits only", () => {
  assert.ok(OTP_CODE.test("123456"));
  assert.ok(!OTP_CODE.test("12345"));
  assert.ok(!OTP_CODE.test("12a456"));
});

test("days remaining rounds up and never goes negative", () => {
  const now = new Date("2026-09-20T00:00:00Z");
  assert.equal(daysRemaining(null, now), null);
  assert.equal(daysRemaining("2026-09-20T12:00:00Z", now), 1);
  assert.equal(daysRemaining("2026-10-20T00:00:00Z", now), 30);
  assert.equal(daysRemaining("2026-09-01T00:00:00Z", now), 0);
  assert.equal(daysRemaining("garbage", now), null);
});

test("expiring soon only applies to dated subscriptions", () => {
  const now = new Date("2026-09-20T00:00:00Z");
  assert.equal(isExpiringSoon(null, now), false);
  assert.equal(isExpiringSoon("2026-09-25T00:00:00Z", now), true);
  assert.equal(isExpiringSoon("2026-11-25T00:00:00Z", now), false);
});

test("only activated subscriptions are counted", () => {
  assert.equal(
    activatedCount([
      { starts_at: "2026-01-01T00:00:00Z" },
      { starts_at: null },
      { starts_at: "2026-02-01T00:00:00Z" },
    ]),
    2,
  );
  assert.equal(activatedCount([]), 0);
});

test("plan moves are classified by tier order", () => {
  assert.equal(planMove("free", "pro"), "upgrade");
  assert.equal(planMove("premium", "free"), "downgrade");
  assert.equal(planMove("pro", "pro"), "current");
});

test("dashboard features follow the live plan definition", () => {
  const free = Object.fromEntries(ownerFeatures(business()).map((f) => [f.key, f]));
  assert.equal(free["links"]?.available, false);
  assert.equal(free["analytics"]?.available, false);
  assert.equal(free["featured"]?.available, false);
  assert.equal(free["photos"]?.detail, "1 من 1 تظهر للزوار");

  const premium = Object.fromEntries(
    ownerFeatures(
      business({
        plan: "premium",
        entitlements: {
          branch_limit: null,
          photo_limit: 15,
          description_limit: null,
          show_links: true,
          analytics: "full",
        },
      }),
    ).map((f) => [f.key, f]),
  );
  assert.equal(premium["links"]?.available, true);
  assert.equal(premium["comparison"]?.available, true);
  assert.equal(premium["featured"]?.available, true);
  assert.equal(premium["branches"]?.detail, "1 من غير محدود");
});

test("errors are mapped to safe Arabic messages", () => {
  assert.match(friendlyPortalError(new Error("Already on this plan")), /هذه الباقة/);
  assert.match(
    friendlyPortalError(new Error("new row violates row-level security 42501")),
    /صلاحية/,
  );
  assert.equal(
    friendlyPortalError(new Error("connection to 10.0.0.1 refused")),
    "تعذر إكمال الطلب. حاول مجدداً.",
  );
});
