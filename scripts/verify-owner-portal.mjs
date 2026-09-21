// Run with: node --env-file=.env.local scripts/verify-owner-portal.mjs
// Verifies the Business Owner Portal database layer end to end: OTP sign-in, ownership isolation,
// plan requests, admin activation, expiry, downgrade, analytics gating and history.
// Creates isolated QA users/businesses and deletes them afterwards. It refuses to run against
// production: set PT_TEST_PROJECT_REF to the ref of the TEST project you intend to use.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const expectedRef = process.env.PT_TEST_PROJECT_REF;
if (!url || !expectedRef || !url.includes(expectedRef)) {
  throw new Error(
    "Refusing to run: SUPABASE_URL must contain PT_TEST_PROJECT_REF (the TEST project ref).",
  );
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const anon = () => createClient(url, process.env.SUPABASE_PUBLISHABLE_KEY, options);
const ok = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const fails = (r, pattern) => {
  assert.ok(r.error, "expected an error");
  if (pattern) assert.match(r.error.message, pattern);
};

const users = [];
const businessIds = [];
const tag = randomUUID().slice(0, 8);
let passed = 0;
const step = (name) => {
  passed += 1;
  console.log(`  ✓ ${name}`);
};

async function makeUser(label, { password = false } = {}) {
  const email = `qa-${label}-${tag}@example.com`;
  const pass = randomUUID() + "aA1!";
  const { user } = ok(
    await admin.auth.admin.createUser({ email, password: pass, email_confirm: true }),
  );
  users.push(user.id);
  return { id: user.id, email, pass, password };
}

// Real OTP path: generate the same one-time code Supabase would email, then verify it like the UI does.
async function otpSession(email) {
  const link = ok(await admin.auth.admin.generateLink({ type: "magiclink", email }));
  const code = link.properties.email_otp;
  assert.match(code, /^\d{6,10}$/, "email_otp should be numeric");
  const client = anon();
  ok(await client.auth.verifyOtp({ email, token: code, type: "email" }));
  return client;
}

async function makeBusiness(name) {
  const row = ok(
    await admin
      .from("businesses")
      .insert({
        slug: `qa-portal-${name}-${tag}`,
        name: `QA ${name} ${tag}`,
        category: "restaurant",
        city: "Riyadh",
        plan: "free",
      })
      .select("id")
      .single(),
  );
  businessIds.push(row.id);
  return row.id;
}

const activeRows = async (id) =>
  ok(
    await admin
      .from("business_subscriptions")
      .select("*")
      .eq("business_id", id)
      .eq("status", "active"),
  );
const planOf = async (id) =>
  ok(await admin.from("businesses").select("plan").eq("id", id).single()).plan;

try {
  console.log("Setup");
  const A = await makeBusiness("a");
  const B = await makeBusiness("b");
  assert.equal((await activeRows(A)).length, 1);
  assert.equal((await activeRows(A))[0].plan, "free");
  step("new businesses get one active Free history row");

  const owner = await makeUser("owner");
  const stranger = await makeUser("stranger");
  const staff = await makeUser("admin");
  ok(await admin.from("user_roles").insert({ user_id: staff.id, role: "admin" }));
  ok(await admin.from("business_owners").insert({ business_id: A, email: owner.email }));
  assert.ok(
    (await admin.from("business_owners").insert({ business_id: A, email: "UPPER@Example.com" }))
      .error,
    "mixed-case emails must be rejected by the database",
  );
  step("owner email assigned; non-normalised emails rejected");

  console.log("Sign-in and isolation");
  const ownerClient = await otpSession(owner.email);
  const strangerClient = await otpSession(stranger.email);
  const overview = ok(await ownerClient.rpc("owner_portal_overview"));
  assert.equal(overview.length, 1);
  assert.equal(overview[0].id, A);
  assert.equal(overview[0].plan, "free");
  assert.equal(overview[0].activated_count, 1);
  step("OTP sign-in works and the owner sees only their own business");

  assert.deepEqual(ok(await strangerClient.rpc("owner_portal_overview")), []);
  assert.deepEqual(
    ok(await strangerClient.from("business_subscriptions").select("id").eq("business_id", A)),
    [],
  );
  assert.deepEqual(ok(await strangerClient.from("business_owners").select("id")), []);
  fails(
    await strangerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
    /Forbidden/,
  );
  step("a signed-in non-owner sees nothing and cannot request plans");

  assert.deepEqual(
    ok(await ownerClient.from("business_subscriptions").select("id").eq("business_id", B)),
    [],
  );
  fails(
    await ownerClient.rpc("request_business_plan", {
      _business_id: B,
      _plan: "pro",
      _period_months: 1,
    }),
    /Forbidden/,
  );
  fails(
    await ownerClient.rpc("owner_business_report", { _business_id: B, _days: 30 }),
    /Forbidden/,
  );
  step("an owner cannot read or change another business");

  const direct = await ownerClient
    .from("businesses")
    .update({ plan: "premium" })
    .eq("id", A)
    .select("id");
  assert.ok(direct.error || direct.data.length === 0);
  assert.equal(await planOf(A), "free");
  assert.ok(
    (
      await ownerClient
        .from("business_subscriptions")
        .insert({
          business_id: A,
          plan: "premium",
          status: "active",
          starts_at: new Date().toISOString(),
        })
    ).error,
  );
  assert.ok(
    (await ownerClient.from("business_owners").insert({ business_id: B, email: owner.email }))
      .error,
  );
  step("owners cannot write plans, subscriptions or ownership directly");

  console.log("Plan requests");
  const pendingPro = ok(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
  );
  assert.equal(pendingPro.status, "pending");
  assert.equal(pendingPro.payment_status, "unpaid");
  assert.equal(await planOf(A), "free", "a request must not change the live plan");
  fails(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "free",
      _period_months: 1,
    }),
    /Already on this plan/,
  );
  const pendingPremium = ok(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "premium",
      _period_months: 12,
    }),
  );
  const afterReplace = ok(
    await admin.from("business_subscriptions").select("id,status").eq("business_id", A),
  );
  assert.equal(afterReplace.find((r) => r.id === pendingPro.id).status, "cancelled");
  assert.equal(afterReplace.filter((r) => r.status === "pending").length, 1);
  step("requests stay pending, duplicates are refused, a new request replaces the old one");

  fails(
    await ownerClient.rpc("admin_activate_subscription", { _id: pendingPremium.id }),
    /Forbidden/,
  );
  fails(
    await strangerClient.rpc("admin_reject_subscription", { _id: pendingPremium.id }),
    /Forbidden/,
  );
  step("owners cannot approve their own requests");

  console.log("Admin activation");
  const staffClient = anon();
  ok(await staffClient.auth.signInWithPassword({ email: staff.email, password: staff.pass }));
  const activated = ok(
    await staffClient.rpc("admin_activate_subscription", {
      _id: pendingPremium.id,
      _payment_status: "not_required",
    }),
  );
  assert.equal(activated.status, "active");
  assert.equal(activated.plan, "premium");
  assert.ok(
    new Date(activated.ends_at) > new Date(Date.now() + 300 * 86_400_000),
    "12-month period applied",
  );
  assert.equal(await planOf(A), "premium");
  assert.equal((await activeRows(A)).length, 1);
  fails(
    await staffClient.rpc("admin_activate_subscription", { _id: pendingPremium.id }),
    /Only pending/,
  );
  const audit = ok(
    await admin.from("admin_audit_log").select("action").eq("entity_id", pendingPremium.id),
  );
  assert.ok(audit.some((a) => a.action === "activate_subscription"));
  step("admin activation applies the plan, supersedes the old one, and is audited");

  const afterActivation = ok(await ownerClient.rpc("owner_portal_overview"))[0];
  assert.equal(afterActivation.plan, "premium");
  assert.equal(afterActivation.entitlements.analytics, "full");
  assert.equal(afterActivation.activated_count, 2);
  assert.equal(afterActivation.pending, null);
  step("the dashboard data reflects the new plan and activation count");

  console.log("Analytics gated by plan");
  ok(
    await admin.from("analytics_events").insert([
      { event_type: "page_view", business_id: A, is_admin: false },
      { event_type: "page_view", business_id: A, is_admin: false },
      { event_type: "click_whatsapp", business_id: A, is_admin: false },
      { event_type: "page_view", business_id: A, is_admin: true },
    ]),
  );
  const full = ok(await ownerClient.rpc("owner_business_report", { _business_id: A, _days: 30 }));
  assert.equal(full.level, "full");
  assert.equal(full.views, 2);
  assert.equal(full.whatsapp, 1);
  assert.ok(Array.isArray(full.timeseries) && full.previous);
  fails(
    await ownerClient.rpc("owner_business_report", { _business_id: A, _days: 5 }),
    /Invalid range/,
  );
  step("Premium gets full analytics; admin traffic is excluded");

  console.log("Downgrade and branch limits");
  for (let n = 1; n <= 3; n++) {
    ok(
      await admin
        .from("business_branches")
        .insert({ business_id: A, name: `QA branch ${n}`, sort_order: n }),
    );
  }
  const free = ok(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "free",
      _period_months: 1,
    }),
  );
  assert.equal(free.status, "active");
  assert.equal(await planOf(A), "free");
  const afterDowngrade = ok(await ownerClient.rpc("owner_portal_overview"))[0];
  assert.equal(afterDowngrade.usage.branches_published, 1);
  assert.equal(afterDowngrade.usage.branches_hidden_by_plan, 2);
  fails(
    await ownerClient.rpc("owner_business_report", { _business_id: A, _days: 30 }),
    /does not include analytics/,
  );
  step("downgrading to Free is immediate, hides extra branches, and removes analytics");

  console.log("Expiry");
  const p2 = ok(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
  );
  ok(await staffClient.rpc("admin_activate_subscription", { _id: p2.id }));
  assert.equal(await planOf(A), "pro");
  ok(
    await admin
      .from("business_subscriptions")
      .update({
        starts_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq("id", p2.id),
  );
  const swept = ok(await admin.rpc("expire_due_subscriptions"));
  assert.ok(swept >= 1);
  assert.equal(await planOf(A), "free");
  const rows = ok(
    await admin.from("business_subscriptions").select("plan,status").eq("business_id", A),
  );
  assert.ok(rows.some((r) => r.plan === "pro" && r.status === "expired"));
  assert.equal((await activeRows(A)).length, 1);
  fails(
    await ownerClient.rpc("expire_due_subscriptions"),
    /permission denied|not found|Could not find/i,
  );
  step("expired subscriptions fall back to Free and the sweep is service-role only");

  console.log("Other entry points and edge cases");
  ok(await admin.from("businesses").update({ plan: "premium" }).eq("id", A));
  const active = await activeRows(A);
  assert.equal(active.length, 1);
  assert.equal(active[0].plan, "premium");
  assert.equal(active[0].source, "admin");
  step("a plan change made outside the portal (admin control) is recorded in history");

  const p3 = ok(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
  );
  const rejected = ok(
    await staffClient.rpc("admin_reject_subscription", { _id: p3.id, _note: "test" }),
  );
  assert.equal(rejected.status, "rejected");
  assert.equal(await planOf(A), "premium");
  const history = ok(
    await ownerClient
      .from("business_subscriptions")
      .select("status,starts_at")
      .eq("business_id", A),
  );
  assert.equal(
    history.filter((r) => r.starts_at).length,
    ok(await ownerClient.rpc("owner_portal_overview"))[0].activated_count,
  );
  step("rejected requests never count as activated");

  ok(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
  );
  assert.equal(ok(await ownerClient.rpc("cancel_plan_request", { _business_id: A })), 1);
  step("owners can cancel their open request");

  ok(await admin.from("business_owners").delete().eq("business_id", A));
  assert.deepEqual(ok(await ownerClient.rpc("owner_portal_overview")), []);
  fails(
    await ownerClient.rpc("request_business_plan", {
      _business_id: A,
      _plan: "pro",
      _period_months: 1,
    }),
    /Forbidden/,
  );
  step("removing an owner revokes access immediately, even with a live session");

  console.log(`\nAll ${passed} checks passed.`);
} finally {
  if (businessIds.length)
    await admin.from("analytics_events").delete().in("business_id", businessIds);
  if (businessIds.length) await admin.from("businesses").delete().in("id", businessIds);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
