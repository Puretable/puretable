# Business Owner Portal

`/portal` lets a business owner sign in with an email one-time code, see their own business, choose a plan, and review subscription history. No payment is processed.

## How access works

- **Ownership is admin-assigned.** Admin → business page → "Owners & subscription history" adds an owner email (`business_owners`). Emails are stored lowercase. Nobody can claim a business themselves.
- **Sign-in:** `requestOwnerCode` (server function) sends a Supabase OTP only when the email is assigned to a business, and always returns the same answer, so the form cannot be used to discover owners or to create junk Auth users. The browser then calls `verifyOtp`.
- **Authorisation is in Postgres, not the UI.** Every owner call goes through `is_business_owner()`, which also requires a _confirmed_ Auth email. Removing an owner takes effect on their next request even if their session is still alive.
- Owners have **no direct write access** to any table. They call RPCs only.

## Data model (reuses existing tables)

- `businesses.plan` + `subscription_plans` remain the source of truth for live features. Nothing was duplicated.
- `business_owners` — who may open the portal for a business.
- `business_subscriptions` — history: `pending | active | expired | superseded | cancelled | rejected`, `starts_at` (activation), `ends_at` (expiry), and payment-ready fields (`payment_status`, `payment_provider`, `payment_reference`, `amount_halalas`, `currency`).
- A trigger records plan changes made anywhere else (e.g. the existing admin "apply plan" control) in the history, so the two never drift.
- "Plans activated before" counts rows with `starts_at` set; rejected/cancelled requests never count.

## Plan flow

| Action                              | Result                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Owner picks Pro / Premium           | `pending` request (`payment_status = unpaid`). Live plan unchanged.                                                           |
| Admin activates (Subscriptions tab) | Becomes `active`, previous row `superseded`, `businesses.plan` updated, ends after the requested 1 or 12 months. Audited.     |
| Admin rejects                       | `rejected`, optional note shown to the owner.                                                                                 |
| Owner picks Free                    | Immediate, no approval. Existing triggers hide extra branches (not deleted) and restore them on upgrade.                      |
| Subscription passes `ends_at`       | Falls back to Free. Runs when the owner opens the portal and in the daily `/api/public/subscription-expiry` cron (03:37 UTC). |

## Adding payment later

Create the pending row as today, then have a payment provider webhook call the same activation path (`activate_subscription_internal` via a new service-role function) and fill `payment_provider`, `payment_reference`, `amount_halalas`. The UI already shows `payment_status`.

## Dashboard features by plan

Values come from the live `subscription_plans` row: branch/photo limits, links, analytics level. Analytics use `owner_business_report`: none = refused, basic = totals, full = totals + breakdown + previous-period comparison.

## Production checklist

1. Run `supabase/migrations/20260920100000_business_owner_portal.sql` on the production database (after review).
2. **OTP codes:** Supabase's Magic Link email template must contain `{{ .Token }}` or owners only receive a link (the link also signs them in). `scripts/configure-email-provider.mjs` currently sets a link-only template.
3. Add the production URL to Supabase Auth → Redirect URLs (`https://puretable.co/portal`).
4. Vercel needs `CRON_SECRET` (already used by sheet sync) and `APP_URL`.
5. Assign owner emails in the admin panel.

## Verification

- `npm test`, `npx tsc --noEmit`, `npm run build`
- `PT_TEST_PROJECT_REF=<test ref> node --env-file=.env.local scripts/verify-owner-portal.mjs` — 17 database checks; refuses to run unless `SUPABASE_URL` contains the ref you name. Never point it at production.
