# Pure Table — Handoff

Last updated: 2026-10-14. Written at the end of a long work session as a safety checkpoint — read
this first if picking the project back up.

## What is live right now

- **Production commit:** `81e0837`.
- **Production URL:** https://www.puretable.co
- **GitHub `main` = production.** No unmerged or stale branches exist.
- Deploys in this project are done via the Vercel CLI directly (`npx vercel@59.25.0 --prod --yes --scope pure-table1`), **not** Vercel's GitHub auto-deploy integration — pushing to `main` alone does not deploy. Someone has to run the CLI command (or reconnect the GitHub integration in Vercel's dashboard).

## Incident: billing-exposure fix broke the admin/filter pages (same day, fixed)

**Symptom:** right after the billing-column-grant fix (`d4069a9`) went live, the 5 category filter
pages and the admin "Business & Branches" list started showing zero businesses, even though the real
business count hadn't changed.

**First confirmed, before touching anything:** a live anon-key read of `businesses` showed the row(s)
were still there — this was never a data-loss incident, no `DELETE` was ever run.

**Root cause:** `d4069a9` revoked the table's blanket table-level `SELECT` grant for `anon` AND
`authenticated` and replaced it with column-level grants. That's correct for closing the billing leak,
but it also means **any query still using `select("*")` or a bare `.select()` against `businesses` now
fails outright** (`42501 permission denied`) instead of just omitting ungranted columns — a genuine
Postgres/PostgREST behavior difference from what was assumed when writing that fix. Several call sites
still did this: `adminListBusinesses`, `adminGetBusiness`, `dedupeBusinesses`, `upsertBusiness`'s save
(all in `businesses.functions.ts`, running as `authenticated`), and the `get_gluten_free_place` MCP
tool (running as `anon`). The public listing/detail queries had already been fixed in `d5eddd1`, so
`شركاء الإطلاق` (a different table) and some pages kept working, which is what made this look
inconsistent at first.

**Fix (`81e0837`, code only, no database change):** exported `PUBLIC_BUSINESS_COLUMNS` (anon-safe) and
a new `AUTHENTICATED_BUSINESS_COLUMNS` (same list + `needs_review`/`review_notes`, which `authenticated`
is actually granted) from `businesses.server.ts`, and pointed every remaining `select("*")`/bare
`select()` against `businesses` at the matching explicit list. `owner-manage.server.ts` was untouched —
it already uses the service-role client there, which bypasses grants entirely and was never affected.

**Verified after deploy, anon key, live:** the exact query `fetchPublicBusinesses()` now sends returns
the real business row successfully, and the billing columns are still correctly blocked (fix didn't
regress). The admin-side (`authenticated`) path is the same explicit-column-list pattern, confirmed
granted in `20261015120000_fix_businesses_column_grants.sql` — ask the user to confirm the admin
Business & Branches page directly, since a live authenticated-role check wasn't done from this session
(would have meant creating a throwaway login, which the user asked not to do mid-incident).

**Lesson for next time:** `select("*")` and `supabase.from(x).select()` with no args are not safe
defaults on any table where column-level grants might ever be narrower than table-level ones — treat
every `businesses` (or similarly sensitive table) query as needing an explicit column list, and when
narrowing a table's grants, grep the whole codebase for `select("*"` / bare `.select()` against that
table *before* considering the grant change done.

## Supabase projects — which is which

| | Project ref | Used for |
|---|---|---|
| **PRODUCTION** | `gmuvmeypkfzbulxgujdu` | Real data. Vercel's Production environment env vars point here. **Never query or modify directly from a coding session** — always via the user pasting SQL into this project's dashboard. |
| **TEST** | `sdfexmyeldrsnvwsdzbh` | Fake/QA data only. `.env.local` in this repo points here. Safe to script against directly with the service-role key for QA setup/teardown. |

## How to run SQL safely (the standing workflow)

1. Write the migration as a new file in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`.
2. Prefer **additive, non-destructive** migrations (new tables/columns, `CREATE OR REPLACE FUNCTION`, grants). Never `DROP COLUMN`/`DROP TABLE` without the user's explicit, separate approval, and never as part of a "routine" change.
3. Give the user: a plain-English summary (Arabic, since that's this user's preference), the rollback SQL, verification queries, and **which Supabase project** to paste it into.
4. The user pastes it themselves into that project's SQL Editor. **Never run SQL against TEST or PRODUCTION directly from this session** — not even "read-only" SELECTs against production, except through the public anon key (see below).
5. Wait for the user to reply "Success" before proceeding to anything that depends on that migration.
6. **Verify column/table-level grants, not just RLS policies.** A hard lesson from this session: `businesses` had a pre-existing table-level `GRANT SELECT ... TO anon, authenticated` from the baseline migration. A narrower column-level `REVOKE` does **not** override a broader table-level `GRANT` in Postgres — the table-level grant wins. If you need to hide specific columns from a role, you must `REVOKE SELECT` (table-level, no column list) from that role first, then `GRANT SELECT (safe, columns, only)` back. Always verify with a live anon-key read after applying, not just by re-reading the SQL.
7. **Reading production is fine, read-only, with the anon key only** — `vercel env pull --environment=production` to get `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`, then query with `@supabase/supabase-js` using those. This is exactly what any visitor's browser can already do, so it's a safe way to verify RLS/grants live. **Never pull or use the production service-role key from a coding session.**

## Rollback commands, most recent first

| Commit | What it was | Rollback |
|---|---|---|
| `81e0837` | Incident fix: restored admin/filter pages broken by `d4069a9` (explicit column lists instead of `select("*")`) | `git revert 81e0837`, push, redeploy — but this re-breaks the admin/filter pages, so fix forward instead if something's still wrong. |
| `d4069a9` | Corrected `businesses` column grants (the real fix for the billing-field exposure) | `git revert d4069a9`, push, redeploy. **Do not actually roll this back** — it's the fix; rolling back re-opens the exposure. If something breaks, fix forward instead. |
| `8af8787` / `daf4618` | SQL migrations for the billing-exposure fix (table, functions, grants) | See the rollback SQL given inline when each file was presented to the user (also preserved in this chat's history) — not repeated here since they're DB-only, no app code to revert. |
| `920e3f1` | Contact form rate limiting + honeypot | `git revert 920e3f1`, push, redeploy |
| `ba200a8` | `npm audit fix` for `source-map-js` (high severity) | `git revert ba200a8`, push, redeploy |
| `5b54cd7` | WhatsApp message text change + mobile disclaimer placement | `git revert 5b54cd7`, push, redeploy |
| `a3ba076` | Home-based-business filter → badge + secondary toggle | `git revert a3ba076`, push, redeploy |
| `19a8467` | New logo/brand mark | `git revert 19a8467`, push, redeploy. Old assets (`src/assets/pure-table-logo.png`, `public/favicon.png`) are still in the repo, unreferenced, if a partial/manual revert is preferred instead. |
| `cef1853` | Hid third-party delivery links, consolidated order/contact box, merged disclaimer, badge dedup | `git revert cef1853`, push, redeploy |
| `c7ca52b` / `84ff2c3` | Admin "remember me" + last-email prefill | `git revert <sha>`, push, redeploy |

Redeploy after any revert: `npx vercel@59.25.0 --prod --yes --scope pure-table1`.

## Pending items (not done, by explicit instruction or still needs the user)

- **TEST schema-only sync** — TEST's `business_menu_items` table is missing a `description`/`description_ar` column that production has (confirmed: production has it, TEST does not — this breaks the owner-portal menu-item picker in TEST only). This was investigated but the actual sync migration(s) were never written or applied — the task was superseded by the billing-exposure fix. **Needs a fresh read-only comparison of TEST vs production schema before writing the sync SQL** — don't assume the `description` column gap is the only difference.
- **CSP (Content-Security-Policy) header** — explicitly **not** added, per direct instruction. Other security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) are already present on production.
- **3 dev-only `npm audit` moderate advisories** (`sprintf-js`/`argparse`, pulled in by `mammoth`) — explicitly **not** fixed, per direct instruction. `mammoth` is used only by `scripts/build-agreement-template.mjs` (a one-off docx→template conversion script), never shipped to the client or server bundle. Fixing requires `npm audit fix --force`, which downgrades `mammoth` to 0.3.29 (breaking).
- **The 3 real home-only businesses** (Noor's Home Kitchen, Date & Oat, Layla Sweets) still have no "what they sell" category — the user explicitly chose to reclassify these themselves via the existing admin editor, not have it guessed/automated.
- **Server function / XSS / link-safety re-audit** — covered by earlier-session code review, not independently re-verified live in the most recent audit pass. Worth a fresh look if there's ever reason to suspect it.

## Dashboard checks the user still needs to do themselves (cannot be verified from a coding session)

- **Supabase (production) → Authentication → URL Configuration:** confirm redirect URLs list only `https://www.puretable.co/**` — no `*.vercel.app` wildcard on production.
- **Supabase (production) → Authentication → Rate Limits:** confirm email/OTP send limits are reasonable.
- **Supabase (production) → Database → Backups:** confirm PITR/backup retention is on. Not visible from here.
- **Supabase (production) → Project Settings → General:** confirm project region.
- **Vercel → puretable → Settings → Environment Variables (Production):** spot-check nothing TEST-related is present; `APP_URL`/`SUPABASE_URL` were verified correct as of this session.
- **Supabase (production) → Logs → API Logs:** if ever investigating past unauthorized reads, filter by `role=anon` and path `/rest/v1/businesses` — retention depends on plan tier.

## Cleanup confirmed

- No `_tmp-*`/`*.tmp.*` scratch files tracked in git or left on disk (scanned at the end of this session).
- No `.env` file tracked in git — only `.env.example` (placeholders only).
- Git history scanned (`git log --all -p`) for `sb_secret_*` and JWT-shaped secrets — none found.
- Production client bundle (`.output/public`) scanned for service-role key leakage — none found.
- Any production credentials pulled during this session (via `vercel env pull`) were used only for read-only anon-key verification and deleted immediately after each use — none remain on disk.
