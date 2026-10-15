-- Adds the remaining billing fields (tax number, representative name/title) and terms_version to
-- admin_list_business_billing()'s output, for the new expandable row in Admin -> Business Info.
-- Same admin-only check as before (has_role(..., 'admin')), same table (business_billing), no
-- other behavior change.
--
-- Arabic summary / ملخص بالعربي:
-- يضيف هذا الملف حقول الفوترة المتبقية (الرقم الضريبي، اسم ولقب الممثل) وإصدار الاتفاقية إلى نتائج
-- دالة عرض بيانات الفوترة للإدارة. لا تغيير على من يستطيع استدعاء هذه الدالة (المدير فقط، كما كان).
--
-- Target: PRODUCTION (gmuvmeypkfzbulxgujdu)

-- ============================================================================
-- ROLLBACK — restores the current (narrower) version.
-- ============================================================================
/*
create or replace function public.admin_list_business_billing()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_out jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into v_out
  from (
    select b.created_at, jsonb_build_object(
      'id', b.id, 'name', b.name, 'name_ar', b.name_ar, 'created_at', b.created_at,
      'plan', b.plan, 'business_info_completed', b.business_info_completed,
      'invoice_status', coalesce(bb.status, 'not_sent'), 'invoice_trade_name', bb.trade_name,
      'invoice_cr_number', bb.cr_number, 'invoice_address', bb.address,
      'invoice_email', bb.email, 'invoice_phone', bb.phone,
      'terms_accepted_at', b.terms_accepted_at,
      'payment_status', (select s.payment_status from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended')),
      'subscription_status', (select s.status from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended'))
    ) j
    from public.businesses b
    left join public.business_billing bb on bb.business_id = b.id
  ) x;
  return v_out;
end
$$;
revoke all on function public.admin_list_business_billing() from public, anon, authenticated;
grant execute on function public.admin_list_business_billing() to authenticated;
*/

-- ============================================================================
-- FIX — run this now.
-- ============================================================================
create or replace function public.admin_list_business_billing()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_out jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into v_out
  from (
    select b.created_at, jsonb_build_object(
      'id', b.id, 'name', b.name, 'name_ar', b.name_ar, 'created_at', b.created_at,
      'plan', b.plan, 'business_info_completed', b.business_info_completed,
      'invoice_status', coalesce(bb.status, 'not_sent'), 'invoice_trade_name', bb.trade_name,
      'invoice_cr_number', bb.cr_number, 'invoice_tax_number', bb.tax_number,
      'invoice_address', bb.address, 'invoice_email', bb.email, 'invoice_phone', bb.phone,
      'invoice_representative_name', bb.representative_name,
      'invoice_representative_title', bb.representative_title,
      'terms_accepted_at', b.terms_accepted_at, 'terms_version', b.terms_version,
      'payment_status', (select s.payment_status from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended')),
      'subscription_status', (select s.status from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended'))
    ) j
    from public.businesses b
    left join public.business_billing bb on bb.business_id = b.id
  ) x;
  return v_out;
end
$$;
revoke all on function public.admin_list_business_billing() from public, anon, authenticated;
grant execute on function public.admin_list_business_billing() to authenticated;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select has_function_privilege('authenticated', 'public.admin_list_business_billing()', 'execute'); -- true
-- select has_function_privilege('anon', 'public.admin_list_business_billing()', 'execute');           -- false
