-- Prepares agreement version "v2" (re-show to all current partners). TEST ONLY. NOT activated —
-- AGREEMENT_TERMS_VERSION is bumped to "v2" on this branch, but this branch is not deployed to
-- production, so nothing changes for real partners until that code ships.
--
-- What this does:
--  1. Adds one row to agreement_versions for terms_version = 'v2'.
--  2. The agreement TEXT has not changed since v1 was seeded — checked via git history
--     (src/lib/agreement/partnership-agreement.template.ts has only ever been touched by the two
--     commits that first introduced it, both long before v1 was seeded; v1's seeding commit itself
--     did not touch the template). So v2's full_text/text_sha256 are copied byte-for-byte from v1 —
--     nothing is retyped, and the hash is identical to v1's. This is a deliberate RE-CONFIRMATION
--     step, not a wording change: every current partner's existing acceptance only has
--     businesses.terms_accepted_at/terms_version (and, for anyone who accepted before this branch's
--     agreement_acceptances table existed, a "legacy" row with no user id or hash). Bumping the
--     version forces a fresh click, which is logged with a real auth.uid() and the text's hash —
--     stronger legal evidence, with no content change for the owner to review differently.
--  3. v1's row is untouched (append-only trigger already blocks UPDATE/DELETE on agreement_versions
--     — this migration only INSERTs a new row, it never could touch v1 even if it tried).
--
-- Arabic summary / ملخص بالعربي:
-- يضيف هذا الملف إصداراً جديداً للاتفاقية باسم "v2" في جدول agreement_versions، بنفس النص الحالي
-- تماماً (لم يتغيّر النص منذ الإصدار v1 — تم التأكد من ذلك بمراجعة تاريخ الملف في Git). الهدف ليس
-- تغيير الصياغة، بل الحصول على موافقة جديدة مسجَّلة بشكل كامل (هوية المستخدم + بصمة النص) من كل
-- شريك حالي، لأن بعض الموافقات القديمة لم تكن مسجَّلة بهذا التفصيل. لا يُحذف أو يُعدَّل إصدار v1.
-- هذا الملف لا يُفعّل شيئاً على الإنتاج — فقط يحضّر البيانات على TEST.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
begin;
delete from public.agreement_versions where terms_version = 'v2';
commit;
*/
-- Note: agreement_versions normally blocks DELETE too (append-only trigger), so this rollback must
-- run as the table owner/service role with the trigger temporarily disabled, e.g.:
--   alter table public.agreement_versions disable trigger agreement_versions_append_only;
--   delete from public.agreement_versions where terms_version = 'v2';
--   alter table public.agreement_versions enable trigger agreement_versions_append_only;
-- (trigger name per information_schema.triggers if it differs from this guess — check first with:
--   select tgname from pg_trigger where tgrelid = 'public.agreement_versions'::regclass;)

-- ============================================================================
-- GUARD
-- ============================================================================
do $$
begin
  if not exists (select 1 from public.app_config where key = '__is_test_env') then
    raise exception
      'ABORT: __is_test_env marker not found. This file is for the TEST project only and must never run on PRODUCTION.';
  end if;
  if not exists (select 1 from public.agreement_versions where terms_version = 'v1') then
    raise exception 'ABORT: agreement_versions.v1 not found — run 20261019_agreement_evidence.sql first.';
  end if;
end $$;

-- ============================================================================
-- FIX — run this now, on TEST only.
-- ============================================================================
begin;

insert into public.agreement_versions (terms_version, full_text, text_sha256)
select 'v2', full_text, text_sha256
from public.agreement_versions
where terms_version = 'v1'
on conflict (terms_version) do nothing;

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- 1. Exactly two versions exist, v2's text/hash identical to v1's:
--   select terms_version, text_sha256, length(full_text) from public.agreement_versions order by terms_version;
--
-- 2. No business has accepted v2 yet (expected — this is a preparation step only):
--   select count(*) from public.agreement_acceptances where terms_version = 'v2';  -- expect 0
--
-- 3. Every business currently shows its OLD version (expected, until the code deploy + real bump):
--   select count(*) from public.businesses where terms_version is distinct from 'v2';  -- should equal total businesses
