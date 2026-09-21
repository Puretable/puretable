import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MenuItemInput,
  OwnerBranchInput,
  OwnerBusinessInput,
  OwnerLinkInput,
  OwnerPhotosInput,
  assertAllowedPhotoUrls,
  assertPhotoLimit,
  ownerUploadPrefix,
  safetyFieldsChanged,
  toHttpUrl,
} from "./owner-manage.schemas";
import { validateImageFile } from "./image-upload";

const BUSINESS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SUPABASE = "https://example.supabase.co";

const validBusiness = () => ({
  name: "Green Oak",
  name_ar: "جرين أوك",
  description: "Gluten free kitchen",
  city: "Riyadh",
  phone: "+966 11 123 4567",
  whatsapp: "0551234567",
  instagram: "greenoak",
  website: "https://greenoak.example",
  maps_url: "https://maps.app.goo.gl/abc",
  hours: { sun: "9-5" },
  no_location: false,
  safety: "green" as const,
  shared_kitchen: false,
  dedicated_gf: true,
});

test("a valid owner listing is accepted and normalised", () => {
  const parsed = OwnerBusinessInput.parse({
    ...validBusiness(),
    website: "  greenoak.example/menu ",
  });
  assert.equal(parsed.website, "https://greenoak.example/menu");
  assert.equal(parsed.name_ar, "جرين أوك");
  assert.equal(OwnerBusinessInput.parse({ ...validBusiness(), name_ar: "  " }).name_ar, null);
});

test("owners cannot smuggle admin-only fields into a save", () => {
  const parsed = OwnerBusinessInput.parse({
    ...validBusiness(),
    plan: "premium",
    published: true,
    verified: true,
    slug: "hijack",
    category: "restaurant",
    categories: ["featured"],
    offers_booking: true,
    needs_review: false,
    id: OTHER,
  });
  for (const key of [
    "plan",
    "published",
    "verified",
    "slug",
    "category",
    "categories",
    "offers_booking",
    "needs_review",
    "id",
  ]) {
    assert.equal(key in parsed, false, `${key} must be stripped`);
  }
});

test("dangerous or malformed URLs are rejected", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "ftp://files.example/x",
    "not a url at all",
  ]) {
    assert.equal(toHttpUrl(bad), null, bad);
    assert.equal(
      OwnerBusinessInput.safeParse({ ...validBusiness(), website: bad }).success,
      false,
      bad,
    );
    assert.equal(
      OwnerBusinessInput.safeParse({ ...validBusiness(), maps_url: bad }).success,
      false,
      bad,
    );
  }
  assert.equal(
    OwnerBusinessInput.safeParse({ ...validBusiness(), instagram: "javascript:alert(1)" }).success,
    false,
  );
  assert.equal(
    OwnerBusinessInput.safeParse({ ...validBusiness(), whatsapp: "<script>" }).success,
    false,
  );
  assert.equal(
    OwnerBusinessInput.safeParse({ ...validBusiness(), phone: "call me maybe" }).success,
    false,
  );
});

test("angle brackets are refused in every free-text field", () => {
  for (const field of [
    "name",
    "name_ar",
    "description",
    "description_ar",
    "products",
    "address",
    "city",
    "precautions_note",
    "discount_code",
  ]) {
    const result = OwnerBusinessInput.safeParse({
      ...validBusiness(),
      [field]: "</script><img src=x onerror=alert(1)>",
    });
    assert.equal(result.success, false, field);
  }
  assert.equal(
    OwnerBusinessInput.safeParse({ ...validBusiness(), hours: { sun: "<b>9</b>" } }).success,
    false,
  );
  assert.equal(
    OwnerBusinessInput.safeParse({ ...validBusiness(), hours: { funday: "9-5" } }).success,
    false,
  );
});

test("required flags cannot be omitted (so a save can never silently reset them)", () => {
  for (const key of ["no_location", "shared_kitchen", "dedicated_gf", "safety", "hours"] as const) {
    const input: Record<string, unknown> = validBusiness();
    delete input[key];
    assert.equal(OwnerBusinessInput.safeParse(input).success, false, key);
  }
  assert.equal(OwnerBusinessInput.safeParse({ ...validBusiness(), safety: "blue" }).success, false);
});

test("photo urls must come from this business's own upload folder or already be saved", () => {
  const own = `${ownerUploadPrefix(SUPABASE, BUSINESS)}1700-photo.png`;
  const ctx = {
    supabaseUrl: SUPABASE,
    businessId: BUSINESS,
    alreadySaved: ["https://legacy.example/old.jpg"],
  };
  assert.doesNotThrow(() => assertAllowedPhotoUrls([own, "https://legacy.example/old.jpg"], ctx));
  assert.throws(
    () => assertAllowedPhotoUrls(["https://evil.example/pixel.gif"], ctx),
    /uploaded through the portal/,
  );
  assert.throws(() =>
    assertAllowedPhotoUrls([`${ownerUploadPrefix(SUPABASE, OTHER)}1-x.png`], ctx),
  );
  assert.throws(() =>
    assertAllowedPhotoUrls([`${ownerUploadPrefix(SUPABASE, BUSINESS)}../${OTHER}/x.png`], ctx),
  );
  assert.throws(
    () => assertAllowedPhotoUrls([ownerUploadPrefix(SUPABASE, BUSINESS)], ctx),
    /uploaded through the portal/,
  );
  assert.throws(() => assertAllowedPhotoUrls(["javascript:alert(1)"], ctx));
  assert.equal(
    ownerUploadPrefix(`${SUPABASE}/`, BUSINESS),
    `${SUPABASE}/storage/v1/object/public/business-covers/owners/${BUSINESS}/`,
  );
});

test("the plan photo limit counts cover + gallery, and never forces removal of existing photos", () => {
  assert.doesNotThrow(() => assertPhotoLimit(1, 1, 0));
  assert.throws(() => assertPhotoLimit(2, 1, 1), /Photo limit reached/);
  assert.doesNotThrow(() => assertPhotoLimit(3, 1, 3)); // already over (admin set): may keep, not grow
  assert.throws(() => assertPhotoLimit(4, 1, 3));
  assert.equal(OwnerPhotosInput.safeParse({ cover_url: "", photos: [] }).success, true);
  assert.equal(OwnerPhotosInput.safeParse({ photos: [] }).success, false); // cover_url must be explicit
  assert.equal(
    OwnerPhotosInput.safeParse({ cover_url: null, photos: Array(41).fill("x") }).success,
    false,
  );
});

test("changing safety information is detected (it withdraws the verified badge)", () => {
  const before = { safety: "green", shared_kitchen: false, dedicated_gf: true };
  assert.equal(
    safetyFieldsChanged(before, { safety: "green", shared_kitchen: false, dedicated_gf: true }),
    false,
  );
  assert.equal(
    safetyFieldsChanged(before, { safety: "red", shared_kitchen: false, dedicated_gf: true }),
    true,
  );
  assert.equal(
    safetyFieldsChanged(before, { safety: "green", shared_kitchen: true, dedicated_gf: true }),
    true,
  );
  assert.equal(
    safetyFieldsChanged(before, { safety: "green", shared_kitchen: false, dedicated_gf: false }),
    true,
  );
  assert.equal(
    safetyFieldsChanged(
      { safety: null },
      { safety: "red", shared_kitchen: false, dedicated_gf: false },
    ),
    false,
  );
});

const menu = (over: Record<string, unknown> = {}) => ({
  business_id: BUSINESS,
  name: "Almond cake",
  name_ar: "كيكة اللوز",
  price: 25.5,
  photo_url: null,
  safety: "orange",
  ...over,
});

test("menu items accept the three existing safety colours only", () => {
  for (const safety of ["green", "orange", "red"])
    assert.equal(MenuItemInput.safeParse(menu({ safety })).success, true, safety);
  for (const safety of ["none", "blue", "", undefined])
    assert.equal(MenuItemInput.safeParse(menu({ safety })).success, false, String(safety));
});

test("menu item price, name and photo rules", () => {
  assert.equal(MenuItemInput.parse(menu({ price: "" })).price, null);
  assert.equal(MenuItemInput.parse(menu({ price: 0 })).price, 0);
  assert.equal(MenuItemInput.safeParse(menu({ price: -1 })).success, false);
  assert.equal(MenuItemInput.safeParse(menu({ price: 100001 })).success, false);
  assert.equal(MenuItemInput.safeParse(menu({ price: "abc" })).success, false);
  assert.equal(MenuItemInput.safeParse(menu({ name: "" })).success, false);
  assert.equal(MenuItemInput.safeParse(menu({ name: "<script>" })).success, false);
  assert.equal(MenuItemInput.safeParse(menu({ name: "x".repeat(121) })).success, false);
  assert.equal(MenuItemInput.parse(menu({ name_ar: " " })).name_ar, null);
  assert.equal(MenuItemInput.safeParse(menu({ business_id: "not-a-uuid" })).success, false);
  const parsed = MenuItemInput.parse({ ...menu(), currency: "USD", created_at: "x" });
  assert.equal("currency" in parsed, false);
});

test("branches and links reuse the admin schemas but drop plan automation fields", () => {
  const branch = OwnerBranchInput.parse({
    business_id: BUSINESS,
    name: "Olaya",
    plan_limited: true,
    maps_url: "maps.google.com/?q=1",
    published: true,
  });
  assert.equal("plan_limited" in branch, false);
  assert.equal(branch.maps_url, "https://maps.google.com/?q=1");
  assert.deepEqual(branch.hours, {});
  assert.equal(
    OwnerBranchInput.safeParse({ business_id: BUSINESS, name: "x", maps_url: "javascript:1" })
      .success,
    false,
  );
  assert.equal(OwnerBranchInput.safeParse({ business_id: BUSINESS, name: "<b>" }).success, false);

  const link = OwnerLinkInput.parse({
    business_id: BUSINESS,
    platform: "jahez",
    url: "Order here: https://jahez.example/x.",
  });
  assert.equal(link.url, "https://jahez.example/x");
  assert.equal(
    OwnerLinkInput.safeParse({
      business_id: BUSINESS,
      platform: "jahez",
      url: "javascript:alert(1)",
    }).success,
    false,
  );
  assert.equal(
    OwnerLinkInput.safeParse({
      business_id: BUSINESS,
      platform: "evilplatform",
      url: "https://x.example",
    }).success,
    false,
  );
});

test("client-side image pre-check mirrors the bucket limits", () => {
  assert.equal(validateImageFile({ type: "image/png", size: 1024 }), null);
  assert.equal(validateImageFile({ type: "image/gif", size: 10 * 1024 * 1024 }), null);
  assert.match(validateImageFile({ type: "application/pdf", size: 10 }) ?? "", /JPG/);
  assert.match(validateImageFile({ type: "image/png", size: 10 * 1024 * 1024 + 1 }) ?? "", /10/);
});
