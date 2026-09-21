// Run with: PT_TEST_PROJECT_REF=<test ref> node --env-file=.env.local scripts/verify-partner-lead-lockdown.mjs
// Verifies that partner leads can no longer be created through the public API while the admin
// inbox (read / update / delete existing leads) keeps working. Refuses to run outside the TEST project.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const ref = process.env.PT_TEST_PROJECT_REF;
if (!url || !ref || !url.includes(ref)) {
  throw new Error(
    "Refusing to run: SUPABASE_URL must contain PT_TEST_PROJECT_REF (the TEST project ref).",
  );
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = () => createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, options);
const ok = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const created = { users: [], leads: [] };
const tag = randomUUID().slice(0, 8);

async function signedInUser(label, { admin = false } = {}) {
  const email = `qa-lead-${label}-${tag}@example.com`;
  const password = randomUUID() + "aA1!";
  const { user } = ok(
    await service.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  created.users.push(user.id);
  if (admin) ok(await service.from("user_roles").insert({ user_id: user.id, role: "admin" }));
  const c = client();
  ok(await c.auth.signInWithPassword({ email, password }));
  return c;
}

try {
  const lead = { id: randomUUID(), business_name: `QA lead ${tag}`, status: "new" };

  const anonymous = await client().from("partner_leads").insert(lead);
  assert.ok(anonymous.error, "anonymous visitors must not be able to create leads");
  console.log("  ✓ anonymous visitors cannot create leads");

  const member = await signedInUser("member");
  assert.ok(
    (await member.from("partner_leads").insert(lead)).error,
    "signed-in members must not create leads",
  );
  assert.deepEqual(
    ok(await member.from("partner_leads").select("id")),
    [],
    "members cannot read leads",
  );
  console.log("  ✓ signed-in non-admin users cannot create or read leads");

  const staff = await signedInUser("admin", { admin: true });
  assert.ok(
    (await staff.from("partner_leads").insert(lead)).error,
    "even admins cannot create leads through the API",
  );
  console.log("  ✓ creating leads through the public API is closed for everyone");

  // Legacy leads must stay manageable from the admin inbox.
  ok(await service.from("partner_leads").insert(lead));
  created.leads.push(lead.id);
  assert.equal(ok(await staff.from("partner_leads").select("id").eq("id", lead.id)).length, 1);
  ok(await staff.from("partner_leads").update({ status: "contacted" }).eq("id", lead.id));
  assert.equal(
    ok(await service.from("partner_leads").select("status").eq("id", lead.id).single()).status,
    "contacted",
  );
  ok(await staff.from("partner_leads").delete().eq("id", lead.id));
  assert.equal(ok(await service.from("partner_leads").select("id").eq("id", lead.id)).length, 0);
  console.log("  ✓ admins can still read, update and delete existing leads");

  console.log("\nAll 4 checks passed.");
} finally {
  if (created.leads.length) await service.from("partner_leads").delete().in("id", created.leads);
  for (const id of created.users) await service.auth.admin.deleteUser(id);
}
