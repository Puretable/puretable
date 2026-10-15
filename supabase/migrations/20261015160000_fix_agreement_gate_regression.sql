-- URGENT PRODUCTION FIX: removes a bug I introduced earlier today in
-- 20261015100000_billing_functions_use_new_table.sql, which currently blocks EVERY business owner
-- from getting past the first-login agreement screen ("تعذر إكمال الطلب" when they press
-- "متابعة إلى لوحة التحكم").
--
-- What happened: when accept_partnership_agreement was rewritten to point at the new
-- business_billing table, a billing-completeness check was accidentally added that was never part
-- of the original function. The original design (see 20261005090000_self_service_signup.sql,
-- comment above the original version of this function) is explicit: "Accepting the agreement is
-- now the first-login gate, independent of the billing fields: it only requires ownership, not
-- that any other field exist yet." Billing info is filled in AFTER the agreement, in a separate
-- step — so the added check always fails (no business has billing data yet at this point), and
-- every owner gets stuck with no way forward.
--
-- The correct billing-completeness gate already exists, correctly, in request_business_plan
-- (supabase/migrations/20261005090000_self_service_signup.sql) — it only applies when upgrading to
-- a paid plan, which is the right place for it. This file does not touch that function.
--
-- This fix only removes the wrongly-added check. It does not change the function's permission
-- check, its inputs/outputs, or anything else.
--
-- Arabic summary / ملخص بالعربي:
-- هذا إصلاح عاجل لخطأ حدث اليوم عند نقل بيانات الفوترة إلى جدول جديد: صار شرط قبول الاتفاقية
-- يتطلب وجود بيانات فوترة محفوظة مسبقًا — لكن بيانات الفوترة تُدخل بعد قبول الاتفاقية، لا قبلها.
-- هذا يعني أن كل مالك منشأة يحاول الدخول لأول مرة يتوقف عند هذه الخطوة ولا يستطيع المتابعة. هذا
-- الملف يحذف هذا الشرط الخاطئ فقط، ويرجع الدالة لتصرفها الأصلي الصحيح (تتطلب فقط أن يكون الشخص
-- مالك المنشأة، بدون أي شرط على بيانات الفوترة). لا تغييرات أخرى.
--
-- Target: PRODUCTION (gmuvmeypkfzbulxgujdu)

-- ============================================================================
-- ROLLBACK — restores the buggy version (NOT recommended; only here for consistency with the
-- standing workflow). Re-running this would re-introduce the bug this file fixes.
-- ============================================================================
/*
create or replace function public.accept_partnership_agreement(_business_id uuid, _terms_version text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.business_billing where business_id = _business_id and trade_name is not null
  ) then
    raise exception 'Billing fields have not been saved yet' using errcode = 'check_violation';
  end if;
  update public.businesses
     set business_info_completed = true, terms_accepted_at = now(), terms_version = _terms_version
   where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.accept_partnership_agreement(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_partnership_agreement(uuid, text) to authenticated;
*/

-- ============================================================================
-- FIX — run this now.
-- ============================================================================
create or replace function public.accept_partnership_agreement(_business_id uuid, _terms_version text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.businesses
     set terms_accepted_at = now(), terms_version = _terms_version
   where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.accept_partnership_agreement(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_partnership_agreement(uuid, text) to authenticated;

-- ============================================================================
-- VERIFY — confirm the billing check is gone and permissions are unchanged.
-- ============================================================================
-- Should show the function body with NO reference to business_billing:
-- select prosrc from pg_proc where proname = 'accept_partnership_agreement';
--
-- Should both still be true (permissions unchanged by this fix):
-- select has_function_privilege('authenticated', 'public.accept_partnership_agreement(uuid, text)', 'execute');  -- true
-- select has_function_privilege('anon', 'public.accept_partnership_agreement(uuid, text)', 'execute');           -- false
