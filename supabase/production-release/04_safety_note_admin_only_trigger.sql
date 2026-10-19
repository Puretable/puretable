-- PRODUCTION RELEASE — file 4 of 5. Run ONLY AFTER the code deploy is confirmed live, not before.
--
-- NOT BACKWARD COMPATIBLE WITH THE OLD CODE: the currently-live production owner-portal form lets
-- an owner freely type and submit precautions_note (the shared-kitchen note), and that value is
-- saved as sent. If this trigger is added while the OLD code is still live, a normal owner save
-- that happens to change precautions_note (including indirectly — the old form sends null whenever
-- "مطبخ مشترك" is unticked) would be rejected by the database with "Only an admin may change the
-- shared-kitchen note", breaking that owner's save entirely. The NEW code (this release) already
-- always sends the business's own current stored precautions_note unchanged, regardless of what the
-- owner edits — so once the new code is live, this trigger can never fire for a real owner session,
-- and only adds a database-level backstop against a crafted/direct request. Do not run this file
-- until you've confirmed the new code is live (see the release checklist, step c).
--
-- Arabic summary / ملخص بالعربي:
-- **لا تُشغّل هذا الملف إلا بعد تأكيد أن الكود الجديد يعمل فعلياً على الإنتاج.** يمنع هذا الملف أي
-- شخص غير الإدارة من تغيير "نص المطبخ المشترك" من قاعدة البيانات مباشرة. الكود القديم الحالي يسمح
-- لصاحب المنشأة بتعديل هذا النص بحرية، فلو شُغّل هذا الملف قبل الكود الجديد، قد يفشل حفظ بيانات أي
-- صاحب منشأة يغيّر هذا النص (حتى بشكل غير مباشر). الكود الجديد لا يرسل هذا النص للتعديل إطلاقاً، لذا
-- هذا الملف آمن تماماً بعد نشر الكود — وهو حماية إضافية فقط من قاعدة البيانات نفسها.
--
-- Target: PRODUCTION ONLY (gmuvmeypkfzbulxgujdu). See the guard below — it can only confirm the
-- INVERSE (this is not the TEST project); visually confirm the project ref in the Supabase dashboard
-- URL yourself before pasting, as the primary safeguard.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
begin;
drop trigger if exists enforce_shared_kitchen_note_admin_only on public.businesses;
drop function if exists public.enforce_shared_kitchen_note_admin_only();
commit;
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
-- FIX — run this ONLY after the code deploy (step b/c of the release checklist), never before.
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
-- VERIFICATION
-- ============================================================================
-- 1. The trigger exists and the old broad one (if it ever existed) does not:
--   select tgname from pg_trigger where tgrelid = 'public.businesses'::regclass
--     and tgname = 'enforce_shared_kitchen_note_admin_only'; -- one row
--
-- 2. A normal owner save (name/description, not touching the note) still works —
--    test this yourself with your own test account right after running this file.
