-- Reverts the PDF-specific pieces of 20261004090000: the owner now reads the filled agreement as a
-- normal page instead of a generated PDF (headless-Chromium rendering was not viable within this
-- project's Vercel plan limits). Nothing from 20261003090000 (billing fields, the visibility gate)
-- is touched.

-- Phase 2 now gates on the billing fields actually being saved (phase 1), instead of a PDF existing.
create or replace function public.accept_partnership_agreement(_business_id uuid, _terms_version text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.businesses where id = _business_id and invoice_trade_name is not null
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
      'invoice_status', b.invoice_status, 'invoice_trade_name', b.invoice_trade_name,
      'invoice_cr_number', b.invoice_cr_number, 'invoice_address', b.invoice_address,
      'invoice_email', b.invoice_email, 'invoice_phone', b.invoice_phone,
      'terms_accepted_at', b.terms_accepted_at,
      'payment_status', (select s.payment_status from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended')),
      'subscription_status', (select s.status from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended'))
    ) j
    from public.businesses b
  ) x;
  return v_out;
end
$$;
revoke all on function public.admin_list_business_billing() from public, anon, authenticated;
grant execute on function public.admin_list_business_billing() to authenticated;

alter table public.businesses drop column agreement_pdf_path;

-- Supabase blocks direct deletes on storage tables from plain SQL (`storage.protect_delete()`).
-- The 'agreements' bucket was never actually used (no PDF generation ever succeeded), so it holds no
-- objects and is harmless left in place; delete it later from the Dashboard's Storage page if desired.
