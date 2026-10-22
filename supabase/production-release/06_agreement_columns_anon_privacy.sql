-- PRODUCTION RELEASE — file 6. Run ONLY AFTER the code deploy is confirmed live, not before.
-- DO NOT RUN YET — prepared ahead of time; wait until the TEST version of this change has been
-- checked and approved.
--
-- NOT BACKWARD COMPATIBLE WITH THE OLD CODE: the currently-live production code's
-- PUBLIC_BUSINESS_COLUMNS (src/lib/businesses.server.ts) still selects terms_accepted_at and
-- terms_version for anonymous requests (the public /business/$id page loader, and the public MCP
-- get_gluten_free_place tool, which spreads the whole row into its public JSON response — a real
-- leak, not just an unused select). If this file runs before the new code deploys, that select
-- starts failing outright (Postgres refuses a query naming a column the role has no grant on) —
-- breaking the public business page and the MCP tool, not just hiding the two fields. The new code
-- removes both columns from PUBLIC_BUSINESS_COLUMNS (and adds them to AUTHENTICATED_BUSINESS_COLUMNS
-- instead, so the owner portal and admin keep full access), so it works correctly whether this file
-- has run yet or not. Deploy the code first; run this file only once that deploy is confirmed stable.
--
-- Arabic summary / ملخص بالعربي:
-- **لا تُشغّل هذا الملف إلا بعد تأكيد أن الكود الجديد يعمل فعلياً على الإنتاج.** الكود القديم
-- الحالي يقرأ عمودي "تاريخ قبول الاتفاقية" و"إصدار الاتفاقية" حتى لصفحة المنشأة العامة ولأداة
-- MCP العامة؛ لو شُغّل هذا الملف قبل الكود الجديد فستتعطل صفحة المنشأة العامة وأداة MCP تماماً إلى
-- حين نشر الكود الجديد. هذا الملف يمنع الزوار العاديين (anon) من قراءة هذين العمودين مباشرة
-- نهائياً، ليغلق تسريباً حقيقياً كان موجوداً عبر أداة MCP العامة. دخول المالك والإدارة
-- (authenticated) لا يتأثر إطلاقاً.
--
-- Target: PRODUCTION ONLY (gmuvmeypkfzbulxgujdu). See the guard below — it can only confirm the
-- INVERSE (this is not the TEST project); visually confirm the project ref in the Supabase dashboard
-- URL yourself before pasting, as the primary safeguard.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
grant select (terms_accepted_at, terms_version) on public.businesses to anon;
*/

-- ============================================================================
-- GUARD
-- ============================================================================
do $$
begin
  if exists (select 1 from public.app_config where key = '__is_test_env') then
    raise exception
      'ABORT: __is_test_env marker found — this looks like the TEST project, not production. Confirm the project ref (gmuvmeypkfzbulxgujdu) in the dashboard URL before pasting.';
  end if;
end $$;

-- ============================================================================
-- FIX — run this ONLY after the code deploy is confirmed live, never before.
-- ============================================================================
begin;

revoke select (terms_accepted_at, terms_version) on public.businesses from anon;

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- 1. anon can no longer read these two columns directly (via the publishable/anon key, not the
--    dashboard's own admin connection, which bypasses grants):
--   select terms_accepted_at, terms_version from businesses limit 1;  -- expect a permission error
--
-- 2. anon can still read everything else on businesses normally:
--   select id, name, city, description from businesses limit 1;      -- expect normal rows
--
-- 3. The public site smoke test: open a real published business page in a private/incognito
--    browser window (never logged in) and confirm it loads normally.
--
-- 4. authenticated (owner/admin) access is unchanged — log into the owner portal with your own
--    account and confirm the agreement gate / admin business-info page still shows the agreement
--    date and version correctly.
