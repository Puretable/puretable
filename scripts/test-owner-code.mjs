// Prints a valid one-time sign-in code for an email, for manual review on the TEST project.
// Use when Supabase's default mailer does not deliver the email (it is rate limited and link-only).
// Run: node --env-file=.env.local scripts/test-owner-code.mjs you@example.com
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
if (!url || !process.env.PT_TEST_PROJECT_REF || !url.includes(process.env.PT_TEST_PROJECT_REF)) {
  throw new Error("Refusing to run: set PT_TEST_PROJECT_REF to the TEST project ref.");
}
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: node scripts/test-owner-code.mjs <email>");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw error;
console.log(data.properties.email_otp);
