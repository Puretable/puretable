-- Adds a database-level backstop so only an admin session can ever change a business's safety
-- level, shared-kitchen status, its note (precautions_note), or the dedicated-kitchen flag — even
-- if application code changes later. TEST ONLY.
--
-- Context: the owner portal's save path (updateOwnerBusiness, src/lib/owner-manage.server.ts) uses
-- the service-role client, which bypasses RLS and column grants entirely — so a plain column-level
-- REVOKE on these columns would not actually stop that write path. The portal UI no longer offers
-- editing these fields, and the server function now pins them to the business's current stored
-- values regardless of what is submitted (same deploy as this file). This trigger is the
-- defense-in-depth layer: it rejects any UPDATE that actually changes one of these columns unless
-- the caller's own session has the admin role — independent of which code path tried to write it.
-- The admin's own edit path (upsertBusiness) writes through the admin's own authenticated session
-- (not the service role), so auth.uid() resolves to the real admin and the check passes normally —
-- the admin page keeps working exactly as before.
--
-- Arabic summary / ملخص بالعربي:
-- يضيف هذا الملف حماية على مستوى قاعدة البيانات نفسها: لا يمكن تغيير مستوى الأمان، حالة المطبخ
-- المشترك، نصه، أو علامة "مطبخ مخصص" إلا من جلسة مدير حقيقية. حتى لو عاد خطأ برمجي مستقبلاً في كود
-- التطبيق ويحاول تمرير هذه القيم من بوابة المالك، قاعدة البيانات ترفض التغيير. لا يؤثر هذا على صفحة
-- الإدارة — المدير يحفظ من خلال جلسته الموثّقة الخاصة، ويستمر العمل كالمعتاد.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
drop trigger if exists enforce_safety_admin_only on public.businesses;
drop function if exists public.enforce_safety_admin_only();
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
-- FIX — run this now, on TEST only.
-- ============================================================================
begin;

create or replace function public.enforce_safety_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.safety is distinct from old.safety
    or new.shared_kitchen is distinct from old.shared_kitchen
    or new.precautions_note is distinct from old.precautions_note
    or new.dedicated_gf is distinct from old.dedicated_gf
  ) and not coalesce(public.has_role(auth.uid(), 'admin'), false) then
    raise exception
      'Only an admin may change safety level, shared-kitchen status, its note, or the dedicated-kitchen flag'
      using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_safety_admin_only() from public, anon, authenticated;

drop trigger if exists enforce_safety_admin_only on public.businesses;
create trigger enforce_safety_admin_only before update on public.businesses
for each row execute function public.enforce_safety_admin_only();

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select tgname from pg_trigger where tgrelid = 'public.businesses'::regclass and tgname = 'enforce_safety_admin_only';
-- select prosrc from pg_proc where proname = 'enforce_safety_admin_only';
