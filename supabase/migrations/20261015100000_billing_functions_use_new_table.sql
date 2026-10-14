-- Second step of the billing-exposure fix (expand step 2 of 3): points the 4 functions that read or
-- write billing fields at the new public.business_billing table instead of businesses.invoice_*. The
-- old columns on `businesses` are still untouched and still hold the real data — this migration does
-- not drop or stop writing to them from outside these functions; it only changes where these 4
-- specific functions look. Nothing here is destructive: every function keeps its exact same inputs,
-- outputs and permission checks (owner-only / admin-only), so no caller (owner portal, admin billing
-- list, agreement gate) needs any behavior change beyond the app-code deploy that ships alongside
-- this file.

create or replace function public.save_business_billing_fields(
  _business_id uuid, _trade_name text, _cr_number text, _tax_number text default null,
  _address text default null, _email text default null, _phone text default null,
  _representative_name text default null, _representative_title text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if btrim(coalesce(_trade_name, '')) = '' or btrim(coalesce(_cr_number, '')) = '' then
    raise exception 'Trade name and CR number are required' using errcode = 'check_violation';
  end if;
  insert into public.business_billing (
    business_id, trade_name, cr_number, tax_number, address, email, phone,
    representative_name, representative_title, updated_at
  )
  values (
    _business_id, btrim(_trade_name), btrim(_cr_number), nullif(btrim(coalesce(_tax_number, '')), ''),
    nullif(btrim(coalesce(_address, '')), ''), nullif(lower(btrim(coalesce(_email, ''))), ''),
    nullif(btrim(coalesce(_phone, '')), ''), nullif(btrim(coalesce(_representative_name, '')), ''),
    nullif(btrim(coalesce(_representative_title, '')), ''), now()
  )
  on conflict (business_id) do update set
    trade_name = excluded.trade_name,
    cr_number = excluded.cr_number,
    tax_number = coalesce(excluded.tax_number, public.business_billing.tax_number),
    address = coalesce(excluded.address, public.business_billing.address),
    email = coalesce(excluded.email, public.business_billing.email),
    phone = coalesce(excluded.phone, public.business_billing.phone),
    representative_name =
      coalesce(excluded.representative_name, public.business_billing.representative_name),
    representative_title =
      coalesce(excluded.representative_title, public.business_billing.representative_title),
    updated_at = now();
  update public.businesses set business_info_completed = true where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.save_business_billing_fields(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_business_billing_fields(uuid, text, text, text, text, text, text, text, text)
  to authenticated;

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

create or replace function public.admin_set_invoice_status(_business_id uuid, _status text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _status not in ('sent', 'not_sent') then
    raise exception 'Invalid invoice status' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.businesses where id = _business_id) then
    raise exception 'Business not found' using errcode = 'no_data_found';
  end if;
  insert into public.business_billing (business_id, status, updated_at)
  values (_business_id, _status, now())
  on conflict (business_id) do update set status = excluded.status, updated_at = now();
end
$$;
revoke all on function public.admin_set_invoice_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_invoice_status(uuid, text) to authenticated;
