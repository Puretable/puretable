// Run with (PowerShell):
//   $env:PT_TEST_PROJECT_REF='<test ref>'; npx tsx --env-file=.env.local scripts/verify-owner-self-service.ts
// Exercises the owner self-service server logic against a REAL Supabase project: tenant isolation,
// business info / branches / photos / links / gluten-free menu, plan limits, and admin suspend /
// reactivate. Creates isolated QA users and businesses and removes them afterwards.
// Refuses to run unless SUPABASE_URL contains PT_TEST_PROJECT_REF.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  deleteMenuItem,
  deleteOwnerBranch,
  deleteOwnerLink,
  saveMenuItem,
  saveOwnerBranch,
  saveOwnerLink,
  signOwnerUpload,
  updateOwnerBusiness,
  updateOwnerPhotos,
  type Actor,
} from "../src/lib/owner-manage.server";
import {
  MenuItemInput,
  OwnerBranchInput,
  OwnerBusinessInput,
  OwnerLinkInput,
  OwnerPhotosInput,
} from "../src/lib/owner-manage.schemas";

const url = process.env["SUPABASE_URL"];
const ref = process.env["PT_TEST_PROJECT_REF"];
if (!url || !ref || !url.includes(ref)) {
  throw new Error(
    "Refusing to run: SUPABASE_URL must contain PT_TEST_PROJECT_REF (the TEST project ref).",
  );
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, opts);
const anonClient = () => createClient(url, process.env["SUPABASE_PUBLISHABLE_KEY"]!, opts);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ok = (r: { data: any; error: { message: string } | null }): any => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
async function rejects(work: Promise<unknown>, pattern: RegExp, label: string) {
  try {
    await work;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    assert.match(message, pattern, `${label}: wrong error "${message}"`);
    return;
  }
  assert.fail(`${label}: expected an error matching ${pattern}`);
}

const tag = randomUUID().slice(0, 8);
const created = { users: [] as string[], businesses: [] as string[], objects: [] as string[] };
let checks = 0;
const step = (name: string) => {
  checks += 1;
  console.log(`  ✓ ${name}`);
};

async function makeUser(label: string, { admin = false } = {}) {
  const email = `qa-self-${label}-${tag}@example.com`;
  const password = randomUUID() + "aA1!";
  const { user } = ok(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  if (!user) throw new Error("user not created");
  created.users.push(user.id);
  if (admin) ok(await service.from("user_roles").insert({ user_id: user.id, role: "admin" }));
  // Real OTP path, same as the portal sign-in.
  const link = ok(await service.auth.admin.generateLink({ type: "magiclink", email }));
  const client = anonClient();
  ok(await client.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" }));
  return { id: user.id, email, client };
}
const actorFor = (u: { id: string; client: SupabaseClient }): Actor => ({
  userClient: u.client,
  adminClient: service,
  userId: u.id,
  supabaseUrl: url,
});

async function makeBusiness(name: string, published = false) {
  const row = ok(
    await service
      .from("businesses")
      .insert({
        slug: `qa-self-${name}-${tag}`,
        name: `QA ${name} ${tag}`,
        category: "cafe",
        city: "Riyadh",
        plan: "free",
        published,
      })
      .select("id")
      .single(),
  );
  created.businesses.push(row.id);
  return row.id as string;
}

const validInfo = (over: Record<string, unknown> = {}) => ({
  name: "QA Cafe Renamed",
  name_ar: "مقهى الاختبار",
  description: "Fresh gluten-free bakes",
  description_ar: "مخبوزات طازجة خالية من الجلوتين",
  city: "Riyadh",
  phone: "+966 11 555 0101",
  whatsapp: "0551234567",
  instagram: "qa_cafe",
  website: "https://qa-cafe.example",
  maps_url: "https://maps.app.goo.gl/qa",
  hours: { sun: "9:00 AM - 10:00 PM" },
  no_location: false,
  safety: "green",
  shared_kitchen: false,
  dedicated_gf: true,
  ...over,
});
const parseInfo = (o: Record<string, unknown>) => OwnerBusinessInput.parse(o);
const parseMenu = (o: Record<string, unknown>) => MenuItemInput.parse(o);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

try {
  console.log("Setup");
  const A = await makeBusiness("a", true);
  const B = await makeBusiness("b", true);
  const owner = await makeUser("owner");
  const ownerB = await makeUser("ownerb");
  const stranger = await makeUser("stranger");
  const staff = await makeUser("admin", { admin: true });
  ok(await service.from("business_owners").insert({ business_id: A, email: owner.email }));
  ok(await service.from("business_owners").insert({ business_id: B, email: ownerB.email }));
  const ownerActor = actorFor(owner);
  const strangerActor = actorFor(stranger);
  const staffActor = actorFor(staff);
  const ownerBActor = actorFor(ownerB);

  console.log("Business information");
  const saved = await updateOwnerBusiness(ownerActor, A, parseInfo(validInfo()));
  assert.equal(saved.name, "QA Cafe Renamed");
  assert.equal(saved.phone, "+966 11 555 0101");
  assert.equal(saved.website, "https://qa-cafe.example/");
  assert.equal(saved.hours.sun, "9:00 AM - 10:00 PM");
  const afterSave = ok(
    await service
      .from("businesses")
      .select("plan,published,slug,category,verified")
      .eq("id", A)
      .single(),
  );
  assert.deepEqual(afterSave, {
    plan: "free",
    published: true,
    slug: `qa-self-a-${tag}`,
    category: "cafe",
    verified: false,
  });
  step("owner edits their listing; plan, slug, publish state and category stay untouched");

  console.log("Tenant isolation");
  await rejects(
    updateOwnerBusiness(ownerActor, B, parseInfo(validInfo({ name: "Hijacked" }))),
    /Forbidden/,
    "owner A → business B",
  );
  await rejects(
    updateOwnerBusiness(strangerActor, A, parseInfo(validInfo())),
    /Forbidden/,
    "stranger → business A",
  );
  await rejects(
    saveOwnerBranch(ownerActor, OwnerBranchInput.parse({ business_id: B, name: "x" })),
    /Forbidden/,
    "branch on B",
  );
  await rejects(
    saveOwnerLink(
      ownerActor,
      OwnerLinkInput.parse({ business_id: B, platform: "jahez", url: "https://j.example/x" }),
    ),
    /Forbidden/,
    "link on B",
  );
  await rejects(
    saveMenuItem(ownerActor, parseMenu({ business_id: B, name: "x", price: 1, safety: "green" })),
    /Forbidden/,
    "menu on B",
  );
  await rejects(
    saveMenuItem(
      strangerActor,
      parseMenu({ business_id: A, name: "x", price: 1, safety: "green" }),
    ),
    /Forbidden/,
    "stranger menu",
  );
  await rejects(signOwnerUpload(ownerActor, B, "a.png"), /Forbidden/, "upload into B's folder");
  await rejects(
    updateOwnerPhotos(ownerActor, B, OwnerPhotosInput.parse({ cover_url: null, photos: [] })),
    /Forbidden/,
    "photos on B",
  );
  assert.equal(
    ok(await service.from("businesses").select("name").eq("id", B).single()).name,
    `QA b ${tag}`,
  );
  step("an owner (or any signed-in stranger) cannot read, change or upload for another business");

  const direct = await owner.client
    .from("businesses")
    .update({ name: "direct" })
    .eq("id", A)
    .select("id");
  assert.ok(
    direct.error || direct.data?.length === 0,
    "owners must not write businesses through the API",
  );
  assert.ok(
    (await owner.client.from("business_branches").insert({ business_id: A, name: "direct" })).error,
  );
  assert.ok(
    (
      await owner.client
        .from("business_links")
        .insert({ business_id: A, platform: "website", url: "https://x.example" })
    ).error,
  );
  assert.ok(
    (
      await owner.client
        .from("business_menu_items")
        .insert({ business_id: A, name: "direct", safety: "green" })
    ).error,
  );
  assert.ok(
    (
      await anonClient()
        .from("business_menu_items")
        .insert({ business_id: A, name: "anon", safety: "green" })
    ).error,
  );
  assert.equal(
    ok(await service.from("business_menu_items").select("id").eq("business_id", A)).length,
    0,
  );
  step("no direct API writes for owners or anonymous visitors (only the checked server path)");

  const ownRows = ok(await owner.client.from("businesses").select("id").in("id", [A, B]));
  assert.deepEqual(ownRows.map((r: { id: string }) => r.id).sort(), [A, B].sort()); // both are published, so both public
  const hidden = await makeBusiness("hidden", false);
  ok(await service.from("business_owners").insert({ business_id: hidden, email: owner.email }));
  assert.equal(
    ok(await owner.client.from("businesses").select("id").eq("id", hidden)).length,
    1,
    "owner reads own unpublished business",
  );
  assert.equal(
    ok(await stranger.client.from("businesses").select("id").eq("id", hidden)).length,
    0,
    "others cannot",
  );
  assert.equal(
    ok(await anonClient().from("businesses").select("id").eq("id", hidden)).length,
    0,
    "public cannot",
  );
  ok(await service.from("business_owners").delete().eq("business_id", hidden));
  step("owners can read their own unpublished listing; nobody else can");

  console.log("Verified badge");
  ok(
    await service
      .from("businesses")
      .update({ verified: true, safety: "green", dedicated_gf: true })
      .eq("id", A),
  );
  await updateOwnerBusiness(ownerActor, A, parseInfo(validInfo({ phone: "+966 11 555 0202" })));
  assert.equal(
    ok(await service.from("businesses").select("verified").eq("id", A).single()).verified,
    true,
  );
  await updateOwnerBusiness(
    ownerActor,
    A,
    parseInfo(validInfo({ safety: "red", dedicated_gf: false })),
  );
  assert.equal(
    ok(await service.from("businesses").select("verified").eq("id", A).single()).verified,
    false,
  );
  step(
    "changing contact details keeps the verified badge; changing safety information withdraws it",
  );

  console.log("Photos");
  const signed = await signOwnerUpload(ownerActor, A, "My Cover (1).PNG");
  created.objects.push(signed.path);
  assert.ok(signed.path.startsWith(`owners/${A}/`));
  assert.ok(
    signed.readUrl.startsWith(`${url}/storage/v1/object/public/business-covers/owners/${A}/`),
  );
  const uploaded = await anonClient()
    .storage.from("business-covers")
    .uploadToSignedUrl(signed.path, signed.token, PNG, { contentType: "image/png" });
  assert.ok(!uploaded.error, uploaded.error?.message);
  const fetched = await fetch(signed.readUrl);
  assert.equal(fetched.status, 200, "uploaded photo must be publicly readable at the returned URL");
  assert.match(fetched.headers.get("content-type") ?? "", /image\/png/);
  await updateOwnerPhotos(
    ownerActor,
    A,
    OwnerPhotosInput.parse({ cover_url: signed.readUrl, photos: [] }),
  );
  assert.equal(
    ok(await service.from("businesses").select("cover_url").eq("id", A).single()).cover_url,
    signed.readUrl,
  );
  step(
    "owner uploads a photo to their own folder and sets it as the cover; the URL is publicly readable",
  );

  await rejects(signOwnerUpload(ownerActor, A, "malware.exe"), /Only JPG/, "non-image upload");
  await rejects(
    updateOwnerPhotos(
      ownerActor,
      A,
      OwnerPhotosInput.parse({ cover_url: "https://evil.example/pixel.gif", photos: [] }),
    ),
    /uploaded through the portal/,
    "external photo url",
  );
  await rejects(
    updateOwnerPhotos(
      ownerActor,
      A,
      OwnerPhotosInput.parse({
        cover_url: `${url}/storage/v1/object/public/business-covers/owners/${B}/1-x.png`,
        photos: [],
      }),
    ),
    /uploaded through the portal/,
    "another business's folder",
  );
  await rejects(
    updateOwnerPhotos(
      ownerActor,
      A,
      OwnerPhotosInput.parse({
        cover_url: signed.readUrl,
        photos: [`${url}/storage/v1/object/public/business-covers/owners/${A}/second.png`],
      }),
    ),
    /Photo limit reached/,
    "Free plan allows one photo in total",
  );
  step("photos: only own-folder uploads, images only, and the Free limit (1 photo) is enforced");

  console.log("Branches");
  const b1 = await saveOwnerBranch(
    ownerActor,
    OwnerBranchInput.parse({
      business_id: A,
      name: "Olaya",
      city: "Riyadh",
      maps_url: "https://maps.app.goo.gl/olaya",
      hours: { mon: "9-5" },
    }),
  );
  assert.equal(b1.published, true);
  await rejects(
    saveOwnerBranch(
      ownerActor,
      OwnerBranchInput.parse({ business_id: A, name: "Second", published: true }),
    ),
    /Branch limit reached/,
    "Free branch limit",
  );
  const updatedBranch = await saveOwnerBranch(
    ownerActor,
    OwnerBranchInput.parse({ business_id: A, id: b1.id, name: "Olaya HQ", city: "Riyadh" }),
  );
  assert.equal(updatedBranch.name, "Olaya HQ");
  const draft = await saveOwnerBranch(
    ownerActor,
    OwnerBranchInput.parse({ business_id: A, name: "Draft branch", published: false }),
  );
  assert.equal(draft.published, false);
  const foreignBranch = ok(
    await service
      .from("business_branches")
      .insert({ business_id: B, name: "B branch" })
      .select("id")
      .single(),
  );
  await rejects(
    saveOwnerBranch(
      ownerActor,
      OwnerBranchInput.parse({ business_id: A, id: foreignBranch.id, name: "steal" }),
    ),
    /Forbidden/,
    "edit B's branch via A",
  );
  await deleteOwnerBranch(ownerActor, A, foreignBranch.id);
  assert.equal(
    ok(await service.from("business_branches").select("id").eq("id", foreignBranch.id)).length,
    1,
    "B's branch survives A's delete attempt",
  );
  await deleteOwnerBranch(ownerActor, A, draft.id);
  assert.equal(
    ok(await service.from("business_branches").select("id").eq("id", draft.id)).length,
    0,
  );
  step(
    "branches: add, edit, delete; plan limit enforced; cannot touch another business's branch by id",
  );

  console.log("Order & contact links");
  const l1 = await saveOwnerLink(
    ownerActor,
    OwnerLinkInput.parse({
      business_id: A,
      platform: "jahez",
      url: "Order here: https://jahez.example/qa-cafe.",
      product_name: "Cake",
      branch_id: b1.id,
    }),
  );
  assert.equal(l1.url, "https://jahez.example/qa-cafe");
  await rejects(
    saveOwnerLink(
      ownerActor,
      OwnerLinkInput.parse({
        business_id: A,
        platform: "keeta",
        url: "https://k.example",
        branch_id: foreignBranch.id,
      }),
    ),
    /Forbidden/,
    "link to B's branch",
  );
  const l1b = await saveOwnerLink(
    ownerActor,
    OwnerLinkInput.parse({
      business_id: A,
      id: l1.id,
      platform: "jahez",
      url: "https://jahez.example/new",
    }),
  );
  assert.equal(l1b.url, "https://jahez.example/new");
  const foreignLink = ok(
    await service
      .from("business_links")
      .insert({ business_id: B, platform: "website", url: "https://b.example" })
      .select("id")
      .single(),
  );
  await rejects(
    saveOwnerLink(
      ownerActor,
      OwnerLinkInput.parse({
        business_id: A,
        id: foreignLink.id,
        platform: "website",
        url: "https://steal.example",
      }),
    ),
    /Forbidden/,
    "edit B's link",
  );
  await deleteOwnerLink(ownerActor, A, foreignLink.id);
  assert.equal(
    ok(await service.from("business_links").select("id").eq("id", foreignLink.id)).length,
    1,
  );
  await deleteOwnerLink(ownerActor, A, l1.id);
  assert.equal(ok(await service.from("business_links").select("id").eq("id", l1.id)).length, 0);
  step(
    "links: add, edit, delete; share text is cleaned; cannot use or touch another business's branch/link",
  );

  console.log("Gluten-free menu (Free plan)");
  const item = await saveMenuItem(
    ownerActor,
    parseMenu({
      business_id: A,
      name: "Almond cake",
      name_ar: "كيكة اللوز",
      price: 25.555,
      safety: "orange",
      sort_order: 0,
    }),
  );
  assert.equal(Number(item.price), 25.56);
  assert.equal(item.safety, "orange");
  assert.equal(item.currency, "SAR");
  for (const safety of ["green", "orange", "red"] as const) {
    const t = await saveMenuItem(
      ownerActor,
      parseMenu({ business_id: A, id: item.id, name: "Almond cake", price: 30, safety }),
    );
    assert.equal(t.safety, safety);
  }
  const noPrice = await saveMenuItem(
    ownerActor,
    parseMenu({ business_id: A, name: "Seasonal special", price: "", safety: "green" }),
  );
  assert.equal(noPrice.price, null);
  step(
    "menu: owner adds and edits items on the Free plan, with all three existing safety colours and optional price",
  );

  assert.ok(
    (
      await service
        .from("business_menu_items")
        .insert({ business_id: A, name: "x", safety: "blue" })
    ).error,
    "DB rejects unknown safety values",
  );
  assert.ok(
    (
      await service
        .from("business_menu_items")
        .insert({ business_id: A, name: "x", safety: "green", price: -5 })
    ).error,
    "DB rejects negative price",
  );
  assert.ok(
    (
      await service
        .from("business_menu_items")
        .insert({ business_id: A, name: "x", safety: "green", photo_url: "javascript:alert(1)" })
    ).error,
    "DB rejects non-https photo urls",
  );
  step(
    "menu: the database itself rejects invalid safety values, negative prices and non-https photo URLs",
  );

  const menuPhoto = await signOwnerUpload(ownerActor, A, "cake.jpg");
  created.objects.push(menuPhoto.path);
  ok(
    await service.storage
      .from("business-covers")
      .upload(menuPhoto.path, PNG, { contentType: "image/png", upsert: true }),
  );
  const withPhoto = await saveMenuItem(
    ownerActor,
    parseMenu({
      business_id: A,
      id: item.id,
      name: "Almond cake",
      price: 30,
      safety: "green",
      photo_url: menuPhoto.readUrl,
    }),
  );
  assert.equal(withPhoto.photo_url, menuPhoto.readUrl);
  await rejects(
    saveMenuItem(
      ownerActor,
      parseMenu({
        business_id: A,
        id: item.id,
        name: "Almond cake",
        price: 30,
        safety: "green",
        photo_url: "https://evil.example/x.png",
      }),
    ),
    /uploaded through the portal/,
    "external menu photo",
  );
  step("menu: item photos come from the owner's own upload folder only");

  const publicItems = ok(
    await anonClient().from("business_menu_items").select("id,name,safety").eq("business_id", A),
  );
  assert.equal(publicItems.length, 2, "anonymous visitors see the menu of a published business");
  ok(await service.from("businesses").update({ published: false }).eq("id", A));
  assert.equal(
    ok(await anonClient().from("business_menu_items").select("id").eq("business_id", A)).length,
    0,
    "…but not of an unpublished one",
  );
  assert.equal(
    ok(await owner.client.from("business_menu_items").select("id").eq("business_id", A)).length,
    2,
    "the owner still sees their own items",
  );
  assert.equal(
    ok(await stranger.client.from("business_menu_items").select("id").eq("business_id", A)).length,
    0,
  );
  ok(await service.from("businesses").update({ published: true }).eq("id", A));
  step("menu visibility: public for published businesses only; owners always see their own");

  await rejects(
    saveMenuItem(
      ownerBActor,
      parseMenu({ business_id: A, id: item.id, name: "hijack", price: 1, safety: "red" }),
    ),
    /Forbidden/,
    "other owner edits item",
  );
  await deleteMenuItem(ownerBActor, B, item.id).catch(() => undefined);
  assert.equal(
    ok(await service.from("business_menu_items").select("id").eq("id", item.id)).length,
    1,
    "item survives another owner's delete attempt",
  );
  await deleteMenuItem(ownerActor, A, noPrice.id);
  assert.equal(
    ok(await service.from("business_menu_items").select("id").eq("id", noPrice.id)).length,
    0,
  );
  step("menu: another owner cannot edit or delete items; the owner can delete their own");

  const fill = Array.from({ length: 199 }, (_, n) => ({
    business_id: A,
    name: `Filler ${n}`,
    safety: "red",
  }));
  ok(await service.from("business_menu_items").insert(fill));
  await rejects(
    saveMenuItem(
      ownerActor,
      parseMenu({ business_id: A, name: "One too many", price: 1, safety: "red" }),
    ),
    /Menu item limit/,
    "menu size cap",
  );
  ok(
    await service
      .from("business_menu_items")
      .delete()
      .eq("business_id", A)
      .like("name", "Filler %"),
  );
  step("menu: capped at 200 items per business");

  console.log("Subscriptions, suspension and reactivation");
  // Upgrade through the normal request + admin approval flow.
  ok(
    await owner.client.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
  );
  const pending = ok(
    await service
      .from("business_subscriptions")
      .select("id")
      .eq("business_id", A)
      .eq("status", "pending")
      .single(),
  );
  const activated = ok(
    await staff.client.rpc("admin_activate_subscription", { _id: pending.id }),
  ) as { ends_at: string };
  ok(await service.from("business_branches").update({ published: true }).eq("id", b1.id));
  const extra = [];
  for (const name of ["Branch 2", "Branch 3"])
    extra.push(
      await saveOwnerBranch(
        ownerActor,
        OwnerBranchInput.parse({ business_id: A, name, city: "Riyadh" }),
      ),
    );
  assert.equal(
    ok(
      await service
        .from("business_branches")
        .select("id")
        .eq("business_id", A)
        .eq("published", true),
    ).length,
    3,
    "Pro allows three branches",
  );
  const photoLimitOnPro = await updateOwnerPhotos(
    ownerActor,
    A,
    OwnerPhotosInput.parse({
      cover_url: signed.readUrl,
      photos: [`${url}/storage/v1/object/public/business-covers/owners/${A}/second.png`],
    }),
  );
  assert.equal(photoLimitOnPro.photos.length, 1, "Pro raises the photo limit");
  step("Pro plan (approved by admin) raises the branch and photo limits for the same owner");

  // A request made before suspension, to prove the admin cannot approve it while suspended.
  ok(
    await owner.client.rpc("request_business_plan", {
      _business_id: A,
      _plan: "premium",
      _period_months: 12,
    }),
  );
  const pendingPremium = ok(
    await service
      .from("business_subscriptions")
      .select("id")
      .eq("business_id", A)
      .eq("status", "pending")
      .single(),
  );

  const ownerSuspend = await owner.client.rpc("admin_suspend_business_access", {
    _business_id: A,
    _reason: "x",
  });
  assert.match(ownerSuspend.error?.message ?? "", /Forbidden/, "owner cannot suspend");
  const ownerReactivate = await owner.client.rpc("admin_reactivate_business_access", {
    _business_id: A,
  });
  assert.match(ownerReactivate.error?.message ?? "", /Forbidden/, "owner cannot reactivate");
  const suspended = ok(
    await staff.client.rpc("admin_suspend_business_access", {
      _business_id: A,
      _reason: "Payment dispute",
    }),
  ) as { status: string };
  assert.equal(suspended.status, "suspended");
  assert.equal(
    ok(await service.from("businesses").select("plan").eq("id", A).single()).plan,
    "free",
    "paid features stop",
  );
  assert.equal(
    ok(
      await service
        .from("business_branches")
        .select("id")
        .eq("business_id", A)
        .eq("published", true),
    ).length,
    1,
    "branches beyond the Free limit are hidden, not deleted",
  );
  assert.equal(
    ok(await service.from("business_branches").select("id").eq("business_id", A)).length,
    3,
  );
  const overview = (
    ok(await owner.client.rpc("owner_portal_overview")) as {
      id: string;
      access_suspended: boolean;
      suspension_reason: string;
      plan: string;
      current: { status: string; plan: string };
    }[]
  ).find((b) => b.id === A)!;
  assert.equal(overview.access_suspended, true);
  assert.equal(overview.suspension_reason, "Payment dispute");
  assert.equal(overview.current.status, "suspended");
  assert.equal(overview.current.plan, "pro");
  step(
    "admin suspends: paid features stop, branches are hidden (not deleted), the owner's dashboard shows why",
  );

  await rejects(
    updateOwnerBusiness(ownerActor, A, parseInfo(validInfo())),
    /Access suspended/,
    "info while suspended",
  );
  await rejects(
    updateOwnerPhotos(ownerActor, A, OwnerPhotosInput.parse({ cover_url: null, photos: [] })),
    /Access suspended/,
    "photos while suspended",
  );
  await rejects(
    saveOwnerBranch(ownerActor, OwnerBranchInput.parse({ business_id: A, name: "New" })),
    /Access suspended/,
    "branch while suspended",
  );
  await rejects(
    deleteOwnerBranch(ownerActor, A, extra[0].id),
    /Access suspended/,
    "branch delete while suspended",
  );
  await rejects(
    saveOwnerLink(
      ownerActor,
      OwnerLinkInput.parse({ business_id: A, platform: "website", url: "https://x.example" }),
    ),
    /Access suspended/,
    "link while suspended",
  );
  await rejects(
    saveMenuItem(ownerActor, parseMenu({ business_id: A, name: "New", price: 1, safety: "green" })),
    /Access suspended/,
    "menu while suspended",
  );
  await rejects(
    deleteMenuItem(ownerActor, A, item.id),
    /Access suspended/,
    "menu delete while suspended",
  );
  await rejects(
    signOwnerUpload(ownerActor, A, "a.png"),
    /Access suspended/,
    "upload while suspended",
  );
  assert.ok(
    (
      await owner.client.rpc("request_business_plan", {
        _business_id: A,
        _plan: "free",
        _period_months: 1,
      })
    ).error?.message.match(/Access suspended/),
  );
  assert.ok(
    (await owner.client.rpc("cancel_plan_request", { _business_id: A })).error?.message.match(
      /Access suspended/,
    ),
  );
  assert.equal(
    ok(await owner.client.from("businesses").select("id").eq("id", A)).length,
    1,
    "read access remains",
  );
  assert.equal(
    ok(await owner.client.from("business_menu_items").select("id").eq("business_id", A)).length,
    1,
    "menu is still readable",
  );
  step(
    "while suspended the owner is read-only everywhere (info, photos, branches, links, menu, uploads, plan requests)",
  );

  const adminEdit = await saveMenuItem(
    staffActor,
    parseMenu({
      business_id: A,
      id: item.id,
      name: "Almond cake (admin edit)",
      price: 31,
      safety: "green",
    }),
  );
  assert.equal(adminEdit.name, "Almond cake (admin edit)");
  assert.equal(
    (
      await saveMenuItem(
        staffActor,
        parseMenu({
          business_id: A,
          name: "Admin added",
          price: 5,
          safety: "red",
          photo_url: "https://legacy.example/admin.png",
        }),
      )
    ).photo_url,
    "https://legacy.example/admin.png",
  );
  await deleteMenuItem(staffActor, A, adminEdit.id);
  step("the admin can always manage a business, even while its access is suspended");

  const approve = await staff.client.rpc("admin_activate_subscription", { _id: pendingPremium.id });
  assert.match(approve.error?.message ?? "", /Reactivate the suspended access/);
  const planChange = await service.from("businesses").update({ plan: "premium" }).eq("id", A);
  assert.match(planChange.error?.message ?? "", /Reactivate the suspended subscription/);
  assert.match(
    (await staff.client.rpc("admin_suspend_business_access", { _business_id: A })).error?.message ??
      "",
    /Already suspended/,
  );
  step("a suspended business cannot be upgraded or have its plan changed until it is reactivated");

  const endsBefore = new Date(activated.ends_at).getTime();
  await new Promise((r) => setTimeout(r, 1500));
  const reactivated = ok(
    await staff.client.rpc("admin_reactivate_business_access", { _business_id: A }),
  ) as { status: string; ends_at: string };
  assert.equal(reactivated.status, "active");
  assert.ok(
    new Date(reactivated.ends_at).getTime() >= endsBefore + 1000,
    "end date moves out by the suspended period",
  );
  assert.equal(
    ok(await service.from("businesses").select("plan").eq("id", A).single()).plan,
    "pro",
    "paid plan restored",
  );
  assert.equal(
    ok(
      await service
        .from("business_branches")
        .select("id")
        .eq("business_id", A)
        .eq("published", true),
    ).length,
    3,
    "hidden branches come back",
  );
  assert.match(
    (await staff.client.rpc("admin_reactivate_business_access", { _business_id: A })).error
      ?.message ?? "",
    /not suspended/,
  );
  assert.equal(
    ok(
      await service
        .from("business_subscriptions")
        .select("id")
        .eq("business_id", A)
        .in("status", ["active", "suspended"]),
    ).length,
    1,
    "exactly one current subscription",
  );
  step(
    "admin reactivates: plan and branches are restored and the end date is extended by the suspension",
  );

  const renamed = await updateOwnerBusiness(
    ownerActor,
    A,
    parseInfo(validInfo({ name: "Back in business" })),
  );
  assert.equal(renamed.name, "Back in business");
  const audit = ok(
    await service
      .from("admin_audit_log")
      .select("action")
      .in("action", ["suspend_business_access", "reactivate_business_access"])
      .eq("details->>business_id", A),
  );
  assert.equal(audit.length, 2, "suspend and reactivate are each audited once");
  ok(
    await staff.client.rpc("admin_reject_subscription", { _id: pendingPremium.id, _note: "test" }),
  );
  step(
    "the owner can edit again after reactivation; suspend/reactivate are recorded in the audit log",
  );

  console.log(`\nAll ${checks} checks passed.`);
} finally {
  if (created.objects.length) await service.storage.from("business-covers").remove(created.objects);
  if (created.businesses.length) {
    for (const id of created.businesses) {
      await service.from("admin_audit_log").delete().eq("details->>business_id", id);
    }
    await service.from("businesses").delete().in("id", created.businesses);
  }
  for (const id of created.users) await service.auth.admin.deleteUser(id);
}
