-- Partnership Agreement PDF: extends the post-payment step (20261003090000) into two phases —
-- (1) the owner fills billing fields, which also generates a filled agreement PDF, then
-- (2) the owner reviews that exact PDF and accepts it, which is what actually unblocks the business.
-- `submit_business_info` combined both into one step; it is replaced below by two functions so the
-- app can generate and show the PDF between them. It was never applied anywhere but TEST.

alter table public.businesses
  add column invoice_tax_number text check (invoice_tax_number is null or char_length(invoice_tax_number) <= 50),
  add column invoice_representative_name text check (invoice_representative_name is null or char_length(invoice_representative_name) <= 200),
  add column invoice_representative_title text check (invoice_representative_title is null or char_length(invoice_representative_title) <= 100),
  add column agreement_pdf_path text check (agreement_pdf_path is null or char_length(agreement_pdf_path) <= 300);

-- Private bucket. No client (owner or admin) ever touches it directly — every read is a short-lived
-- signed URL minted server-side, after the server-side code re-checks ownership/admin itself, exactly
-- like the existing signed-upload pattern for business-covers. No storage.objects policy is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agreements', 'agreements', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop function if exists public.submit_business_info(uuid, text, text, text, text, text, text);

-- Phase 1: save the billing/invoice fields. Does not complete the step or touch the agreement PDF —
-- the app generates the PDF right after this call succeeds and writes `agreement_pdf_path` itself
-- (PDF rendering happens in application code, not in the database).
create or replace function public.save_business_billing_fields(
  _business_id uuid, _trade_name text, _cr_number text, _tax_number text, _address text,
  _email text, _phone text, _representative_name text, _representative_title text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if btrim(coalesce(_trade_name, '')) = '' or btrim(coalesce(_cr_number, '')) = ''
     or btrim(coalesce(_address, '')) = '' or btrim(coalesce(_email, '')) = ''
     or btrim(coalesce(_phone, '')) = '' or btrim(coalesce(_representative_name, '')) = ''
     or btrim(coalesce(_representative_title, '')) = '' then
    raise exception 'All fields are required' using errcode = 'check_violation';
  end if;
  update public.businesses
     set invoice_trade_name = btrim(_trade_name), invoice_cr_number = btrim(_cr_number),
         invoice_tax_number = nullif(btrim(coalesce(_tax_number, '')), ''),
         invoice_address = btrim(_address), invoice_email = lower(btrim(_email)),
         invoice_phone = btrim(_phone), invoice_representative_name = btrim(_representative_name),
         invoice_representative_title = btrim(_representative_title)
   where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.save_business_billing_fields(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_business_billing_fields(uuid, text, text, text, text, text, text, text, text)
  to authenticated;

-- Phase 2: accept the agreement whose PDF was just generated. Refuses if no PDF exists yet (the
-- owner must go through phase 1 first) — this is what actually completes the step.
create or replace function public.accept_partnership_agreement(_business_id uuid, _terms_version text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.businesses where id = _business_id and agreement_pdf_path is not null
  ) then
    raise exception 'Agreement PDF has not been generated yet' using errcode = 'check_violation';
  end if;
  update public.businesses
     set business_info_completed = true, terms_accepted_at = now(), terms_version = _terms_version
   where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.accept_partnership_agreement(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_partnership_agreement(uuid, text) to authenticated;

-- Admin billing list: adds the agreement acceptance timestamp and the PDF path (the app turns the
-- path into a short-lived signed URL on demand, admin-gated the same way as every other admin read).
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
      'terms_accepted_at', b.terms_accepted_at, 'agreement_pdf_path', b.agreement_pdf_path,
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
