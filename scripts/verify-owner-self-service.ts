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
  acceptPartnershipAgreement,
  deleteMenuItem,
  deleteOwnerBranch,
  deleteOwnerLink,
  getFirstLoginAgreement,
  saveBusinessBillingFields,
  saveMenuItem,
  saveOwnerBranch,
  saveOwnerBusinessContact,
  saveOwnerLink,
  signOwnerUpload,
  updateOwnerBusiness,
  updateOwnerPhotos,
  type Actor,
} from "../src/lib/owner-manage.server";
import {
  BillingFieldsInput,
  MenuItemInput,
  OwnerBranchInput,
  OwnerBusinessInput,
  OwnerLinkInput,
  OwnerPhotosInput,
} from "../src/lib/owner-manage.schemas";
import { BusinessContactInput } from "../src/lib/businesses.schemas";
import { isFeatured } from "../src/lib/services";

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
const parseBilling = (o: Record<string, unknown>) => BillingFieldsInput.parse(o);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const originalSections = ok(
  await service.from("site_settings").select("sections").eq("id", "default").single(),
).sections as Record<string, boolean> | null;

// Everything below except the dedicated "Premium-for-everyone override" section exercises real
// Free/Pro/Premium tier differences, exactly as already verified — packages_enabled defaults to
// false/absent (the new default), which would otherwise apply the Premium-for-everyone override
// throughout and mask those checks. Restored to the true original state in `finally`.
await service
  .from("site_settings")
  .update({ sections: { ...originalSections, packages_enabled: true } })
  .eq("id", "default");

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

  console.log("Admin-created business: first-login agreement gate");
  // Business A here is created directly by an admin-style insert (not the self-signup RPC), with
  // the owner invited by email — the other real path into the portal. Must behave identically to
  // self-signup: the agreement is acceptable immediately, with zero billing data saved. This is the
  // exact path that regressed in production on 2026-10-15 (see agreement-gate.regression.test.ts).
  const firstLogin = await getFirstLoginAgreement(ownerActor, A, owner.email);
  assert.match(firstLogin.agreementHtml, /<table/, "agreement HTML is returned");
  await rejects(
    getFirstLoginAgreement(strangerActor, A, stranger.email),
    /Forbidden/,
    "a stranger cannot load another business's agreement",
  );
  // Simulate a partner who already accepted v1 before the v2 bump (a raw RPC call with the old
  // version string — this is what every current real partner's row looks like right now).
  ok(
    await owner.client.rpc("accept_partnership_agreement", {
      _business_id: A,
      _terms_version: "v1",
    }),
  );
  assert.equal(
    ok(await service.from("businesses").select("terms_version").eq("id", A).single())
      .terms_version,
    "v1",
    "a pre-bump partner is on v1",
  );

  // The real gate re-triggers: terms_version ("v1") !== AGREEMENT_TERMS_VERSION ("v2").
  ok(await acceptPartnershipAgreement(ownerActor, A, {}, owner.email));
  assert.ok(
    ok(await service.from("businesses").select("terms_accepted_at").eq("id", A).single())
      .terms_accepted_at,
    "an admin-created owner can accept the agreement with no billing_business row at all",
  );
  const termsAfterBump = ok(
    await service.from("businesses").select("terms_version").eq("id", A).single(),
  ).terms_version;
  assert.equal(termsAfterBump, "v2", "the real AGREEMENT_TERMS_VERSION constant is v2 on this branch");
  step("admin-created owner: agreement loads and is acceptable before any billing data exists");

  console.log("Agreement evidence trail (agreement_versions / agreement_acceptances)");
  const acceptanceRows = ok(
    await service
      .from("agreement_acceptances")
      .select("*")
      .eq("business_id", A)
      .order("accepted_at", { ascending: true }),
  );
  assert.equal(acceptanceRows.length, 2, "the v1 row is kept; a new v2 row is added");
  assert.equal(acceptanceRows[0].terms_version, "v1");
  assert.equal(acceptanceRows[1].terms_version, "v2");
  assert.equal(acceptanceRows[1].accepted_by, owner.id);
  const v2 = ok(
    await service
      .from("agreement_versions")
      .select("text_sha256")
      .eq("terms_version", "v2")
      .single(),
  );
  assert.equal(acceptanceRows[1].text_sha256, v2.text_sha256);
  step(
    "a v1 owner re-prompted by the version bump accepts, is logged as v2 (v1 row untouched), with the version's hash",
  );
  const latestAcceptance = acceptanceRows[acceptanceRows.length - 1];

  await rejects(
    (async () =>
      ok(
        await service
          .from("agreement_acceptances")
          .update({ terms_version: "hacked" })
          .eq("id", acceptanceRows[0].id),
      ))(),
    /append-only/,
    "UPDATE on agreement_acceptances (service role)",
  );
  await rejects(
    (async () =>
      ok(await service.from("agreement_acceptances").delete().eq("id", acceptanceRows[0].id)))(),
    /append-only/,
    "DELETE on agreement_acceptances (service role)",
  );
  step("agreement_acceptances rows can never be updated or deleted, not even by service role");

  assert.equal(
    ok(await ownerB.client.from("agreement_acceptances").select("id").eq("business_id", A)).length,
    0,
    "another owner cannot read A's acceptance rows",
  );
  const craftedInsert = await owner.client
    .from("agreement_acceptances")
    .insert({ business_id: A, terms_version: "v1", accepted_by: owner.id });
  assert.ok(
    craftedInsert.error,
    "nobody can insert into agreement_acceptances directly, not even the real owner's own session",
  );
  step("RLS: an owner reads only their own business's acceptance rows; nobody writes directly");

  // The confirmation email is fire-and-forget; give it a moment. Either "sent" or "failed" is a
  // safe outcome here — the recipient is always a QA @example.com address, never a real inbox.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const delivery = ok(
    await service
      .from("email_deliveries")
      .select("recipient,status")
      .eq("metadata->>business_id", A)
      .maybeSingle(),
  );
  if (delivery) {
    assert.ok(
      delivery.recipient.endsWith("@example.com"),
      "the confirmation email only ever targets the QA @example.com address, never a real inbox",
    );
    assert.ok(["sent", "failed"].includes(delivery.status));
  }
  step(
    "a confirmation email was attempted (or safely failed) without blocking the already-successful acceptance",
  );

  // Once on v2, the gate's own condition (terms_accepted_at set AND terms_version === current)
  // is false, so a second real accept call never fires from the UI — it isn't a loop by
  // construction. Re-reading the row confirms the state that condition checks against.
  assert.equal(
    ok(await service.from("businesses").select("terms_version").eq("id", A).single())
      .terms_version,
    "v2",
    "after accepting, the business is on the current version — the gate's re-trigger condition is now false",
  );
  step("a business already on the current version is not re-prompted (no loop)");

  // A future version bump beyond v2 (not seeded here — this simulates it) must still add a new row
  // and keep both older ones, never overwrite them.
  ok(
    await owner.client.rpc("accept_partnership_agreement", {
      _business_id: A,
      _terms_version: "v3-simulated",
    }),
  );
  const acceptanceRowsAfterV3 = ok(
    await service
      .from("agreement_acceptances")
      .select("terms_version")
      .eq("business_id", A)
      .order("accepted_at", { ascending: true }),
  );
  assert.deepEqual(
    acceptanceRowsAfterV3.map((r) => r.terms_version),
    ["v1", "v2", "v3-simulated"],
    "both earlier acceptance rows are kept; a new row is added for the new version",
  );
  step("accepting a further new version adds a row and never overwrites or removes the previous ones");

  const acceptedBusinessIds = new Set(
    (
      ok(await service.from("businesses").select("id").not("terms_accepted_at", "is", null)) as {
        id: string;
      }[]
    ).map((r) => r.id),
  );
  const coveredBusinessIds = new Set(
    (
      ok(await service.from("agreement_acceptances").select("business_id")) as {
        business_id: string;
      }[]
    ).map((r) => r.business_id),
  );
  const uncovered = [...acceptedBusinessIds].filter((id) => !coveredBusinessIds.has(id));
  assert.deepEqual(
    uncovered,
    [],
    "every business with terms_accepted_at set has at least one acceptance row (legacy back-fill)",
  );
  step(
    `legacy back-fill: all ${acceptedBusinessIds.size} business(es) with a prior acceptance are covered`,
  );

  console.log("Business information");
  const saved = await updateOwnerBusiness(ownerActor, A, parseInfo(validInfo()));
  assert.equal(saved.name, "QA Cafe Renamed");
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

  // Single box per field: the owner portal now sends the SAME text for a field and its _ar
  // counterpart (the UI merged the two boxes into one). The server has no opinion on this — it
  // simply stores whatever it's given — so this confirms both columns end up identical, matching
  // what the new UI actually sends on every save.
  const mirroredName = "مقهى الاختبار الموحّد";
  await updateOwnerBusiness(
    ownerActor,
    A,
    parseInfo(
      validInfo({
        name: mirroredName,
        name_ar: mirroredName,
        description: "نص موحّد",
        description_ar: "نص موحّد",
      }),
    ),
  );
  const mirroredRow = ok(
    await service.from("businesses").select("name,name_ar,description,description_ar").eq("id", A).single(),
  );
  assert.equal(mirroredRow.name, mirroredName);
  assert.equal(mirroredRow.name_ar, mirroredName);
  assert.equal(mirroredRow.description, "نص موحّد");
  assert.equal(mirroredRow.description_ar, "نص موحّد");
  step("single box per field: saving sends the same text to both the plain and the _ar column");

  console.log("Safety level stays owner-editable; the shared-kitchen note is admin-only");
  const beforeNote = ok(
    await service
      .from("businesses")
      .select("safety, shared_kitchen, precautions_note, dedicated_gf")
      .eq("id", A)
      .single(),
  );

  const ownerChanged = await updateOwnerBusiness(
    ownerActor,
    A,
    parseInfo(
      validInfo({
        safety: beforeNote.safety === "green" ? "red" : "green",
        shared_kitchen: !beforeNote.shared_kitchen,
      }),
    ),
  );
  assert.notEqual(ownerChanged.safety, beforeNote.safety);
  assert.equal(ownerChanged.shared_kitchen, !beforeNote.shared_kitchen);
  step("an owner can change their own safety level and shared-kitchen status, as before");

  const crafted = await updateOwnerBusiness(
    ownerActor,
    A,
    parseInfo(
      validInfo({
        safety: ownerChanged.safety,
        shared_kitchen: ownerChanged.shared_kitchen,
        precautions_note: "hijacked note",
      }),
    ),
  );
  assert.equal(crafted.precautions_note, beforeNote.precautions_note);
  step(
    "the owner's save endpoint ignores any shared-kitchen note value it is sent, even in a crafted request",
  );

  await rejects(
    (async () =>
      ok(
        await service.from("businesses").update({ precautions_note: "raw hijack" }).eq("id", A),
      ))(),
    /Only an admin may change the shared-kitchen note/,
    "raw service-role write to precautions_note",
  );
  step(
    "the database itself rejects any change to the shared-kitchen note unless the session is an admin",
  );

  ok(await service.from("businesses").update({ safety: "none" }).eq("id", A));
  step("a raw write to the safety level itself (not the note) is not restricted by this trigger");

  await rejects(
    updateOwnerBusiness(ownerBActor, A, parseInfo(validInfo({ safety: "green" }))),
    /Forbidden/,
    "another business's owner changing A's safety/note",
  );
  step("another business's owner cannot change this business's safety level or note at all");

  ok(await staff.client.from("businesses").update({ precautions_note: "admin note" }).eq("id", A));
  assert.equal(
    ok(await service.from("businesses").select("precautions_note").eq("id", A).single())
      .precautions_note,
    "admin note",
  );
  step("an admin's own authenticated session can still edit the shared-kitchen note");

  ok(
    await staff.client
      .from("businesses")
      .update({
        safety: beforeNote.safety,
        shared_kitchen: beforeNote.shared_kitchen,
        precautions_note: beforeNote.precautions_note,
      })
      .eq("id", A),
  );

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

  // Single box per field: the branch editor now sends the SAME text for name/name_ar (and
  // city/city_ar, address/address_ar) — confirm both columns end up identical.
  const mirroredBranchName = "فرع العليا الموحّد";
  await saveOwnerBranch(
    ownerActor,
    OwnerBranchInput.parse({
      business_id: A,
      id: b1.id,
      name: mirroredBranchName,
      name_ar: mirroredBranchName,
      city: "Riyadh",
      city_ar: "Riyadh",
    }),
  );
  const mirroredBranchRow = ok(
    await service.from("business_branches").select("name,name_ar").eq("id", b1.id).single(),
  );
  assert.equal(mirroredBranchRow.name, mirroredBranchName);
  assert.equal(mirroredBranchRow.name_ar, mirroredBranchName);
  step("single box per field: saving a branch sends the same text to both name and name_ar");

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

  console.log("Contact & ordering redesign: business-level contact fields");
  const contact1 = await saveOwnerBusinessContact(
    ownerActor,
    BusinessContactInput.parse({
      business_id: A,
      website: "example.com",
      instagram: "@QA_Cafe",
      tiktok: "qa_cafe",
      email: "hello@qa-cafe.example",
    }),
  );
  assert.equal(contact1.website, "https://example.com/");
  assert.equal(contact1.instagram, "https://instagram.com/QA_Cafe");
  assert.equal(contact1.tiktok, "https://tiktok.com/@qa_cafe");
  assert.equal(contact1.email, "hello@qa-cafe.example");
  step("business-level contact: website/instagram/tiktok/email save with per-type normalization");

  const contact2 = await saveOwnerBusinessContact(
    ownerActor,
    BusinessContactInput.parse({ business_id: A, tiktok: "qa_cafe_v2" }),
  );
  assert.equal(contact2.tiktok, "https://tiktok.com/@qa_cafe_v2");
  assert.equal(
    ok(
      await service
        .from("business_links")
        .select("id")
        .eq("business_id", A)
        .eq("platform", "tiktok"),
    ).length,
    1,
    "re-saving tiktok updates the one business-level row, never a duplicate",
  );
  step("no duplicate business-level link is ever created — the unique index + upsert hold");

  await rejects(
    saveOwnerBusinessContact(
      ownerBActor,
      BusinessContactInput.parse({ business_id: A, website: "https://hijack.example" }),
    ),
    /Forbidden/,
    "another business's owner saving A's contact fields",
  );
  step("another business's owner cannot change this business's contact fields");

  // A legacy business-level business_links("website") row, saved before this redesign, must stay
  // visible to visitors even though the new UI writes to the businesses.website column instead.
  ok(await service.from("businesses").update({ website: null }).eq("id", A));
  const legacyWebsite = ok(
    await service
      .from("business_links")
      .insert({
        business_id: A,
        branch_id: null,
        platform: "website",
        url: "https://legacy.example",
      })
      .select("id")
      .single(),
  );
  await saveOwnerBusinessContact(
    ownerActor,
    BusinessContactInput.parse({ business_id: A, instagram: "qa_cafe" }),
  );
  assert.equal(
    ok(await service.from("business_links").select("id").eq("id", legacyWebsite.id)).length,
    1,
    "the old business_links(website) row is never touched by the new save path",
  );
  step("old data (a legacy business-level link row) is never deleted or rewritten by the new path");

  console.log("Contact & ordering redesign: per-branch pickup/delivery/WhatsApp-orders");
  const brA = await saveOwnerBranch(
    ownerActor,
    OwnerBranchInput.parse({
      business_id: A,
      id: b1.id,
      name: "Olaya HQ",
      phone: "0551234567",
      whatsapp: "0551234567",
      maps_url: "https://maps.example/olaya",
      pickup_enabled: true,
      delivery_enabled: true,
      delivery_url: "https://order.qa-cafe.example",
      whatsapp_orders_enabled: true,
    }),
  );
  assert.equal(brA.phone, "+966551234567");
  assert.equal(brA.whatsapp, "+966551234567");
  assert.equal(brA.pickup_enabled, true);
  assert.equal(brA.delivery_enabled, true);
  assert.equal(brA.delivery_url, "https://order.qa-cafe.example/");
  assert.equal(brA.whatsapp_orders_enabled, true);
  const tagsAfterOn = ok(await service.from("businesses").select("categories").eq("id", A).single())
    .categories as string[];
  assert.ok(tagsAfterOn.includes("svc_pickup") && tagsAfterOn.includes("svc_delivery"));
  step(
    "a branch's pickup/delivery toggles save, and automatically tag the business for both public filters",
  );

  await saveOwnerBranch(
    ownerActor,
    OwnerBranchInput.parse({
      business_id: A,
      id: b1.id,
      name: "Olaya HQ",
      phone: "0551234567",
      whatsapp: "0551234567",
      maps_url: "https://maps.example/olaya",
      whatsapp_orders_enabled: true,
      pickup_enabled: false,
      delivery_enabled: false,
    }),
  );
  const tagsAfterOff = ok(
    await service.from("businesses").select("categories").eq("id", A).single(),
  ).categories as string[];
  assert.ok(!tagsAfterOff.includes("svc_pickup") && !tagsAfterOff.includes("svc_delivery"));
  step("turning both toggles off removes the business from both filters automatically");

  await rejects(
    (async () =>
      ok(await ownerB.client.rpc("owner_sync_pickup_delivery_tags", { _business_id: A })))(),
    /Forbidden/,
    "another business's owner calling the tag-sync RPC for A",
  );
  // RLS silently matches zero rows for a write it denies (no error) — the real proof is that
  // nothing changed, not the absence of an error.
  const categoriesBeforeCrafted = ok(
    await service.from("businesses").select("categories").eq("id", A).single(),
  ).categories;
  await owner.client
    .from("businesses")
    .update({ categories: ["svc_pickup", "cf_totally-fake-tag"] })
    .eq("id", A);
  assert.deepEqual(
    ok(await service.from("businesses").select("categories").eq("id", A).single()).categories,
    categoriesBeforeCrafted,
    "an owner cannot write categories directly at all, by any value — RLS lets the write affect zero rows",
  );
  step(
    "an owner can influence only svc_pickup/svc_delivery, only for their own business, only through the narrow RPC — never any other category tag, never directly",
  );

  assert.equal(
    OwnerBranchInput.safeParse({
      business_id: A,
      id: b1.id,
      name: "Olaya HQ",
      maps_url: "javascript:alert(1)",
    }).success,
    false,
    "javascript: scheme rejected for maps_url",
  );
  assert.equal(
    OwnerBranchInput.safeParse({
      business_id: A,
      id: b1.id,
      name: "Olaya HQ",
      delivery_url: "http://not-https.example",
    }).success,
    false,
    "bare http: rejected for delivery_url",
  );
  step("maps_url/delivery_url reject non-https schemes (javascript:, data:, bare http:)");

  console.log("Gluten-free menu (Free blocked, Pro allowed)");
  await rejects(
    saveMenuItem(
      ownerActor,
      parseMenu({ business_id: A, name: "Blocked", price: 1, safety: "green" }),
    ),
    /Pro or Premium/,
    "Free owner adding a menu item",
  );
  await rejects(
    deleteMenuItem(ownerActor, A, "00000000-0000-0000-0000-000000000000"),
    /Pro or Premium/,
    "Free owner deleting a menu item",
  );
  step("menu: a Free-plan owner cannot add or manage menu items (server-side)");
  ok(await service.from("businesses").update({ plan: "pro" }).eq("id", A));
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
    "menu: a Pro owner adds and edits items, with all three existing safety colours and optional price",
  );

  // Single box per field: the menu editor now sends the SAME text for name/name_ar — confirm both
  // columns end up identical.
  const mirroredItemName = "صنف موحّد";
  await saveMenuItem(
    ownerActor,
    parseMenu({
      business_id: A,
      id: item.id,
      name: mirroredItemName,
      name_ar: mirroredItemName,
      price: 30,
      safety: "green",
    }),
  );
  const mirroredItemRow = ok(
    await service.from("business_menu_items").select("name,name_ar").eq("id", item.id).single(),
  );
  assert.equal(mirroredItemRow.name, mirroredItemName);
  assert.equal(mirroredItemRow.name_ar, mirroredItemName);
  step("single box per field: saving a menu item sends the same text to both name and name_ar");

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
  ok(await service.from("businesses").update({ plan: "free" }).eq("id", A));

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

  console.log("Self-service signup, agreement, and the minimal billing-info gate");
  await rejects(
    (async () =>
      ok(
        await anonClient().rpc("signup_create_business", {
          _business_name: "",
          _email: `qa-signup-${tag}@example.com`,
        }),
      ))(),
    /Business name must be between/,
    "signup with a blank business name",
  );
  await rejects(
    (async () =>
      ok(
        await anonClient().rpc("signup_create_business", {
          _business_name: "QA Signup Biz",
          _email: "not-an-email",
        }),
      ))(),
    /A valid email is required/,
    "signup with an invalid email",
  );
  const signupEmail = `qa-signup-${tag}@example.com`;
  const newBusinessId = ok(
    await anonClient().rpc("signup_create_business", {
      _business_name: "QA Signup Biz",
      _email: signupEmail,
    }),
  ) as string;
  created.businesses.push(newBusinessId);
  const signedUp = ok(
    await service
      .from("businesses")
      .select("published, plan, business_info_completed, terms_accepted_at")
      .eq("id", newBusinessId)
      .single(),
  );
  assert.equal(signedUp.published, false, "a self-signup business starts unpublished");
  assert.equal(signedUp.plan, "free", "a self-signup business starts on the Free plan");
  assert.equal(
    signedUp.business_info_completed,
    false,
    "a self-signup business starts needing the billing-info gate (not the default true)",
  );
  assert.equal(signedUp.terms_accepted_at, null);
  step("open self-signup creates an unpublished Free business and starts both gates incomplete");

  // Log the new owner in the same way the real OTP flow would, without needing real email delivery.
  const { user: signupUser } = ok(
    await service.auth.admin.createUser({
      email: signupEmail,
      password: randomUUID() + "aA1!",
      email_confirm: true,
    }),
  );
  if (!signupUser) throw new Error("signup user not created");
  created.users.push(signupUser.id);
  const signupLink = ok(
    await service.auth.admin.generateLink({ type: "magiclink", email: signupEmail }),
  );
  const signupClient = anonClient();
  ok(
    await signupClient.auth.verifyOtp({
      email: signupEmail,
      token: signupLink.properties.email_otp,
      type: "email",
    }),
  );

  await rejects(
    (async () =>
      ok(
        await stranger.client.rpc("accept_partnership_agreement", {
          _business_id: newBusinessId,
          _terms_version: "v1",
        }),
      ))(),
    /Forbidden/,
    "a stranger cannot accept another business's agreement",
  );
  ok(
    await signupClient.rpc("accept_partnership_agreement", {
      _business_id: newBusinessId,
      _terms_version: "v1",
    }),
  );
  assert.ok(
    ok(
      await service.from("businesses").select("terms_accepted_at").eq("id", newBusinessId).single(),
    ).terms_accepted_at,
    "accepting the agreement does not require any billing field to exist first",
  );
  step("the agreement can be accepted immediately after signup, before any billing field is saved");

  await rejects(
    (async () =>
      ok(
        await signupClient.rpc("request_business_plan", {
          _business_id: newBusinessId,
          _plan: "pro",
          _period_months: 1,
        }),
      ))(),
    /Billing info must be completed/,
    "requesting a paid plan before the billing-info step is complete",
  );
  step("a paid plan cannot be requested until the billing-info step is complete");

  await rejects(
    (async () =>
      ok(
        await signupClient.rpc("save_business_billing_fields", {
          _business_id: newBusinessId,
          _trade_name: "",
          _cr_number: "CR-1",
        }),
      ))(),
    /Trade name and CR number are required/,
    "saving with a blank trade name",
  );
  // Through the real app-layer function (zod validation + RPC together), not a raw RPC call —
  // this is exactly what BillingInfoPanel sends while packages are disabled (the other fields
  // explicitly null), and is what actually caught the zod-schema/RPC mismatch bug during manual
  // testing: the schema had not been relaxed to match the database function's relaxed requirements.
  const { business_id: _billingBusinessId, ...billingFields } = parseBilling({
    business_id: newBusinessId,
    trade_name: "QA Signup Biz",
    cr_number: "CR-999",
    tax_number: null,
    address: null,
    email: null,
    phone: null,
    representative_name: null,
    representative_title: null,
  });
  ok(
    await saveBusinessBillingFields(
      actorFor({ id: signupUser.id, client: signupClient }),
      newBusinessId,
      billingFields,
    ),
  );
  const minimalSaved = ok(
    await service
      .from("businesses")
      .select("business_info_completed")
      .eq("id", newBusinessId)
      .single(),
  );
  assert.equal(
    minimalSaved.business_info_completed,
    true,
    "trade name + CR number alone complete the step — the other fields stay optional",
  );
  const billingSaved = ok(
    await service
      .from("business_billing")
      .select("trade_name, cr_number, address, phone")
      .eq("business_id", newBusinessId)
      .single(),
  );
  assert.equal(billingSaved.trade_name, "QA Signup Biz");
  assert.equal(billingSaved.cr_number, "CR-999");
  assert.equal(billingSaved.address, null, "the deferred fields are never required");
  step("saving just trade name + CR number completes the billing-info gate on its own");

  console.log("Premium-for-everyone override while packages are platform-disabled");
  ok(
    await service
      .from("site_settings")
      .update({ sections: { ...originalSections, packages_enabled: false } })
      .eq("id", "default"),
  );
  const overviewDisabled = ok(await signupClient.rpc("owner_portal_overview")) as Array<{
    id: string;
    plan: string;
    entitlements: { branch_limit: number | null; photo_limit: number; analytics: string };
  }>;
  const freeRowOverridden = overviewDisabled.find((b) => b.id === newBusinessId)!;
  assert.equal(freeRowOverridden.plan, "free", "the stored plan is never changed by the override");
  assert.equal(
    freeRowOverridden.entitlements.photo_limit,
    15,
    "entitlements show Premium's limits",
  );
  assert.equal(
    freeRowOverridden.entitlements.branch_limit,
    null,
    "Premium's branch limit is unlimited",
  );
  assert.equal(freeRowOverridden.entitlements.analytics, "full");
  ok(
    await saveMenuItem(
      actorFor({ id: signupUser.id, client: signupClient }),
      parseMenu({ business_id: newBusinessId, name: "Override item", price: 1, safety: "green" }),
    ),
  );
  step(
    "while packages are disabled, a nominally-Free business gets Premium entitlements and can use the menu",
  );

  ok(
    await service
      .from("site_settings")
      .update({ sections: { ...originalSections, packages_enabled: true } })
      .eq("id", "default"),
  );
  const overviewEnabled = ok(await signupClient.rpc("owner_portal_overview")) as Array<{
    id: string;
    entitlements: { photo_limit: number };
  }>;
  assert.equal(
    overviewEnabled.find((b) => b.id === newBusinessId)!.entitlements.photo_limit,
    1,
    "re-enabling packages restores the business's real (Free) entitlements",
  );
  await rejects(
    deleteMenuItem(
      actorFor({ id: signupUser.id, client: signupClient }),
      newBusinessId,
      "00000000-0000-0000-0000-000000000000",
    ),
    /Pro or Premium/,
    "re-enabling packages restores the real Free-plan menu restriction",
  );
  step("re-enabling packages resumes real Free/Pro/Premium differences exactly as before");

  ok(
    await signupClient.rpc("request_business_plan", {
      _business_id: newBusinessId,
      _plan: "pro",
      _period_months: 1,
    }),
  );
  assert.equal(
    ok(
      await service
        .from("business_subscriptions")
        .select("status")
        .eq("business_id", newBusinessId)
        .eq("status", "pending")
        .single(),
    ).status,
    "pending",
    "now that billing info is on file, requesting a paid plan succeeds",
  );
  step("requesting a paid plan succeeds once the billing-info step is complete");

  // A later PAID admin activation no longer touches business_info_completed at all (that trigger
  // was specific to the old design and has been fully reverted).
  ok(
    await owner.client.rpc("request_business_plan", {
      _business_id: A,
      _plan: "premium",
      _period_months: 1,
    }),
  );
  const pendingRevert = ok(
    await service
      .from("business_subscriptions")
      .select("id")
      .eq("business_id", A)
      .eq("status", "pending")
      .single(),
  );
  const infoBefore = ok(
    await service.from("businesses").select("business_info_completed").eq("id", A).single(),
  ).business_info_completed;
  ok(
    await staff.client.rpc("admin_activate_subscription", {
      _id: pendingRevert.id,
      _payment_status: "paid",
    }),
  );
  assert.equal(
    ok(await service.from("businesses").select("business_info_completed").eq("id", A).single())
      .business_info_completed,
    infoBefore,
    "a paid activation no longer changes business_info_completed — that trigger was reverted",
  );
  step(
    "admin-approved paid activation no longer gates visibility (fully reverted to the old behaviour)",
  );

  const billingRows = ok(await staff.client.rpc("admin_list_business_billing")) as Array<{
    id: string;
    invoice_status: string;
    terms_accepted_at: string | null;
  }>;
  const billingRow = billingRows.find((r) => r.id === A);
  assert.ok(billingRow, "the business appears in the admin billing list");
  assert.equal(billingRow!.invoice_status, "not_sent");
  assert.ok(
    billingRow!.terms_accepted_at,
    "the admin list shows A's agreement acceptance timestamp",
  );
  assert.ok(
    billingRows.find((r) => r.id === newBusinessId)?.terms_accepted_at,
    "the admin list shows the agreement acceptance timestamp",
  );
  await rejects(
    (async () =>
      ok(
        await owner.client.rpc("admin_set_invoice_status", { _business_id: A, _status: "sent" }),
      ))(),
    /Forbidden/,
    "a non-admin cannot set the invoice status",
  );
  ok(await staff.client.rpc("admin_set_invoice_status", { _business_id: A, _status: "sent" }));
  assert.equal(
    ok(await service.from("business_billing").select("status").eq("business_id", A).single())
      .status,
    "sent",
  );
  step("the admin invoice toggle saves immediately and is admin-only");

  console.log("Featured places (Premium OR launch partner, admin-only)");
  const featuredPremium = await makeBusiness("featured-premium");
  const featuredPartner = await makeBusiness("featured-partner");
  ok(await service.from("businesses").update({ plan: "premium" }).eq("id", featuredPremium));
  assert.equal(isFeatured({ plan: "free" }), false, "a Free business is not featured");
  assert.equal(
    isFeatured(
      ok(await service.from("businesses").select("plan").eq("id", featuredPremium).single()),
    ),
    true,
    "an active Premium business is featured",
  );
  step("Premium active -> featured");

  ok(await service.from("businesses").update({ plan: "free" }).eq("id", featuredPremium));
  assert.equal(
    isFeatured(
      ok(await service.from("businesses").select("plan").eq("id", featuredPremium).single()),
    ),
    false,
    "once suspension/expiry reverts the stored plan to free, it drops out of featured automatically",
  );
  step("Premium expired/suspended (plan reverted to free) -> not featured");

  const ownerPartnerInsert = await owner.client
    .from("success_partners")
    .insert({ kind: "business", business_id: featuredPartner, name: "x", active: true });
  assert.ok(ownerPartnerInsert.error, "owner cannot mark a business a launch partner");
  assert.equal(
    ok(await service.from("success_partners").select("id").eq("business_id", featuredPartner))
      .length,
    0,
    "the rejected owner insert left no row behind",
  );
  step("owner cannot write to success_partners (admin-only RLS)");

  const partnerRow = ok(
    await staff.client
      .from("success_partners")
      .insert({
        kind: "business",
        business_id: featuredPartner,
        name: "QA Partner",
        active: true,
      })
      .select("id")
      .single(),
  );
  assert.equal(
    isFeatured({ plan: "free", isLaunchPartner: true }),
    true,
    "a launch partner is featured even on the Free plan",
  );
  step("admin can mark a launch partner, and it is featured without Premium");

  await owner.client.from("success_partners").delete().eq("id", partnerRow.id);
  assert.equal(
    ok(await service.from("success_partners").select("id").eq("id", partnerRow.id)).length,
    1,
    "owner's delete attempt silently affects zero rows — the launch-partner mark stays",
  );
  await owner.client
    .from("success_partners")
    .update({ active: false })
    .eq("id", partnerRow.id);
  assert.equal(
    ok(await service.from("success_partners").select("active").eq("id", partnerRow.id).single())
      .active,
    true,
    "owner's update attempt silently affects zero rows — still active",
  );
  step("owner cannot change featured status in either direction (RLS denies delete/update)");

  ok(await service.from("success_partners").delete().eq("id", partnerRow.id));

  console.log(`\nAll ${checks} checks passed.`);
} finally {
  await service.from("site_settings").update({ sections: originalSections }).eq("id", "default");
  if (created.objects.length) await service.storage.from("business-covers").remove(created.objects);
  if (created.businesses.length) {
    for (const id of created.businesses) {
      await service.from("admin_audit_log").delete().eq("details->>business_id", id);
    }
    await service.from("businesses").delete().in("id", created.businesses);
  }
  for (const id of created.users) await service.auth.admin.deleteUser(id);
}
