-- Corrects 20261016_enforce_safety_admin_only.sql: that trigger blocked ANY change to safety,
-- shared_kitchen, precautions_note, or dedicated_gf unless the session was an admin. That was too
-- broad — business owners are meant to keep choosing their own safety level (green / red / orange /
-- none) from the portal, exactly as before. Only the shared-kitchen note text (precautions_note) is
-- admin-only: owners may see it, never write it. This file replaces the old trigger with one scoped
-- to precautions_note alone. TEST ONLY.
--
-- Arabic summary / ملخص بالعربي:
-- الحماية السابقة كانت واسعة جداً: منعت صاحب المنشأة من تغيير مستوى الأمان نفسه، وهذا خطأ — يجب أن
-- يبقى صاحب المنشأة قادراً على اختيار مستوى الأمان (أخضر/أحمر/مطبخ مشترك/بدون تقييم) كما كان دائماً.
-- الشيء الوحيد الذي يجب أن يبقى حصرياً للإدارة هو نص المطبخ المشترك فقط. يستبدل هذا الملف الحماية
-- القديمة بحماية أضيق تمنع فقط تغيير نص المطبخ المشترك من غير جلسة مدير، ولا تمس مستوى الأمان أو
-- حالة المطبخ المشترك أو علامة "مطبخ مخصص" إطلاقاً.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else.

-- ============================================================================
-- ROLLBACK — restores the previous (overly broad) trigger from 20261016.
-- ============================================================================
/*
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

drop trigger if exists enforce_safety_admin_only on public.businesses;
drop function if exists public.enforce_safety_admin_only();

create or replace function public.enforce_shared_kitchen_note_admin_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.precautions_note is distinct from old.precautions_note
     and not coalesce(public.has_role(auth.uid(), 'admin'), false) then
    raise exception 'Only an admin may change the shared-kitchen note'
      using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_shared_kitchen_note_admin_only() from public, anon, authenticated;

drop trigger if exists enforce_shared_kitchen_note_admin_only on public.businesses;
create trigger enforce_shared_kitchen_note_admin_only before update on public.businesses
for each row execute function public.enforce_shared_kitchen_note_admin_only();

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select tgname from pg_trigger where tgrelid = 'public.businesses'::regclass
--   and tgname = 'enforce_shared_kitchen_note_admin_only'; -- should return one row
-- select tgname from pg_trigger where tgrelid = 'public.businesses'::regclass
--   and tgname = 'enforce_safety_admin_only'; -- should return no rows (dropped)
-- select prosrc from pg_proc where proname = 'enforce_shared_kitchen_note_admin_only';
