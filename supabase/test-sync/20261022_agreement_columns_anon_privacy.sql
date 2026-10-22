-- Removes anon's SELECT access to businesses.terms_accepted_at and businesses.terms_version —
-- the owner's private partnership-agreement signing record. TEST ONLY.
--
-- Why: these two columns were granted to anon as part of the combined anon+authenticated column
-- list in 20261015120000_fix_businesses_column_grants.sql. Auditing every place the app reads them
-- (admin billing page, owner portal AgreementGate, admin.business-info.tsx, server functions) found
-- exactly one anon-reachable path: src/lib/businesses.server.ts's PUBLIC_BUSINESS_COLUMNS, used by
-- the public /business/$id page loader and by the public MCP get_gluten_free_place tool (the MCP
-- tool spreads the whole selected row into its public JSON response — a real, live leak, not just
-- an unused select). mapDbBusiness() never reads these two fields for the public page either way.
-- The matching app-code fix (this branch) drops terms_accepted_at/terms_version from
-- PUBLIC_BUSINESS_COLUMNS and adds them explicitly to AUTHENTICATED_BUSINESS_COLUMNS instead, so
-- nothing anon-reachable needs the column grant once that code is live. Every other read site
-- (owner portal via the owner_portal_overview RPC, owner self-service via AUTHENTICATED_BUSINESS_
-- COLUMNS, admin billing via RPC, admin.business-info.tsx, the two server-role files) runs as
-- `authenticated` or the service role — both untouched by this change.
--
-- Arabic summary / ملخص بالعربي:
-- هذا الملف يمنع الزوار غير المسجّلين (anon) من قراءة عمودي "تاريخ قبول الاتفاقية" و"إصدار
-- الاتفاقية" في جدول المنشآت. هذان العمودان بيانات خاصة بصاحب المنشأة فقط. تم فحص كل الكود: الصفحة
-- العامة للمنشأة وأداة MCP العامة كانت تقرأ هذين العمودين فعلياً (حتى لو الصفحة لا تعرضهما، أداة
-- MCP كانت تُرسلهما ضمن ردّها العام — وهذا تسريب حقيقي). تم تعديل الكود بحيث لا يحتاج أي مسار عام
-- (anon) لهذين العمودين بعد الآن، ولا يزال صاحب المنشأة (owner portal) والإدارة يقرآن حالة الاتفاقية
-- بشكل طبيعي تماماً — لا تأثير عليهما إطلاقاً.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else.

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
  if not exists (select 1 from public.app_config where key = '__is_test_env') then
    raise exception
      'ABORT: __is_test_env marker not found. This file is for the TEST project only and must never run on PRODUCTION.';
  end if;
end $$;

-- ============================================================================
-- FIX — run this now, on TEST only. Requires the matching app-code change (dropping
-- terms_accepted_at/terms_version from PUBLIC_BUSINESS_COLUMNS) to already be deployed to this
-- environment's preview, or the public business page and MCP tool will start failing their select.
-- ============================================================================
begin;

revoke select (terms_accepted_at, terms_version) on public.businesses from anon;

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- 1. anon can no longer read these two columns directly (run as the anon role / via the publishable
--    key):
--   select terms_accepted_at, terms_version from businesses limit 1;  -- expect a permission error
--
-- 2. anon can still read everything else on businesses normally:
--   select id, name, city, description from businesses limit 1;      -- expect normal rows
--
-- 3. authenticated access is unchanged (log in as a test owner or admin):
--   select terms_accepted_at, terms_version from businesses where id = '<your business id>';
--   -- expect the normal value, same as before this file ran
--
-- 4. The owner portal agreement gate and admin business-info page still load and behave normally
--    for both a never-signed test owner and an already-signed test owner.
--
-- 5. The public business page (/business/<slug>) and the MCP get_gluten_free_place tool still load
--    normally and no longer include terms_accepted_at/terms_version anywhere in their response.
