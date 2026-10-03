-- Post-payment business info, required for a business's first-ever paid activation.
--
-- `business_info_completed` defaults to true so every existing business (and every business an
-- admin creates and publishes directly, as today) is completely unaffected. It is only ever set to
-- false by `activate_subscription_internal` below, and only the first time a business's subscription
-- is actually activated with payment_status = 'paid' (a routine later upgrade never re-asks).
--
-- The public read policy is the real enforcement: a business stays invisible to visitors until the
-- owner completes this step, exactly like `published` already works — not just hidden in the UI.
alter table public.businesses
  add column terms_accepted_at timestamptz,
  add column terms_version text check (terms_version is null or char_length(terms_version) <= 20),
  add column business_info_completed boolean not null default true,
  add column invoice_trade_name text check (invoice_trade_name is null or char_length(invoice_trade_name) <= 200),
  add column invoice_cr_number text check (invoice_cr_number is null or char_length(invoice_cr_number) <= 50),
  add column invoice_address text check (invoice_address is null or char_length(invoice_address) <= 300),
  add column invoice_email text check (
    invoice_email is null or (
      char_length(invoice_email) <= 320
      and invoice_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  ),
  add column invoice_phone text check (invoice_phone is null or char_length(invoice_phone) <= 40),
  add column invoice_status text not null default 'not_sent' check (invoice_status in ('sent', 'not_sent'));

-- Replaces the Free-only policy with one that also requires the post-payment step, once a business
-- has ever been asked for it (see above: true for every pre-existing row, so nothing changes for them).
drop policy businesses_public_read on public.businesses;
create policy businesses_public_read on public.businesses for select to anon
using (published and business_info_completed);

-- Admin billing/compliance list: signup date, latest payment status, info/invoice status.
-- Reuses the exact same admin check as every other admin-only function (`has_role(..., 'admin')`).
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

-- Admin-only: the invoice toggle, saved on change (no separate save button).
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
  update public.businesses set invoice_status = _status where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.admin_set_invoice_status(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_invoice_status(uuid, text) to authenticated;

-- The post-payment form itself: owner-only (same ownership check as every other self-service write).
create or replace function public.submit_business_info(
  _business_id uuid, _trade_name text, _cr_number text, _address text, _email text, _phone text,
  _terms_version text
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
     or btrim(coalesce(_phone, '')) = '' then
    raise exception 'All fields are required' using errcode = 'check_violation';
  end if;
  update public.businesses
     set invoice_trade_name = btrim(_trade_name), invoice_cr_number = btrim(_cr_number),
         invoice_address = btrim(_address), invoice_email = lower(btrim(_email)),
         invoice_phone = btrim(_phone), business_info_completed = true,
         terms_accepted_at = now(), terms_version = _terms_version
   where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.submit_business_info(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_business_info(uuid, text, text, text, text, text, text)
  to authenticated;

-- The actual "payment completed" trigger: the first time (and only the first time) a business's
-- subscription is activated with payment_status = 'paid', require the step above before the business
-- is visible again. A later routine upgrade (info already on file) never re-asks.
create or replace function public.activate_subscription_internal(
  _id uuid, _ends_at timestamptz, _payment_status text, _actor uuid
)
returns public.business_subscriptions
language plpgsql security definer set search_path = ''
as $$
declare v_row public.business_subscriptions; v_first_paid boolean;
begin
  select * into v_row from public.business_subscriptions where id = _id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'no_data_found'; end if;
  perform 1 from public.businesses where id = v_row.business_id for update;
  v_first_paid := _payment_status = 'paid' and not exists (
    select 1 from public.business_subscriptions
    where business_id = v_row.business_id and payment_status = 'paid' and id <> _id
  );
  perform set_config('pt.subscription_sync', '1', true);
  update public.business_subscriptions
     set status = 'superseded', ended_at = now()
   where business_id = v_row.business_id and status = 'active' and id <> _id;
  update public.business_subscriptions
     set status = 'active', starts_at = now(), ends_at = _ends_at, ended_at = null,
         payment_status = _payment_status, decided_by = _actor, decided_at = now()
   where id = _id
   returning * into v_row;
  -- Existing triggers hide or restore branches for the new package.
  update public.businesses
     set plan = v_row.plan,
         business_info_completed = case when v_first_paid then false else business_info_completed end
   where id = v_row.business_id;
  perform set_config('pt.subscription_sync', '', true);
  return v_row;
end
$$;
revoke all on function public.activate_subscription_internal(uuid, timestamptz, text, uuid)
  from public, anon, authenticated;

-- Surface the new field to the owner portal (unchanged otherwise).
create or replace function public.owner_portal_overview()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_email text := public.current_owner_email(); v_id uuid; v_out jsonb;
begin
  if auth.uid() is null or v_email is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  for v_id in select o.business_id from public.business_owners o where o.email = v_email loop
    perform public.reconcile_business_subscription(v_id);
  end loop;
  select coalesce(jsonb_agg(x.j order by x.name), '[]'::jsonb) into v_out
  from (
    select b.name, jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'name', b.name, 'name_ar', b.name_ar, 'city', b.city,
      'published', b.published, 'plan', b.plan, 'cover_url', b.cover_url,
      'business_info_completed', b.business_info_completed,
      'entitlements', jsonb_build_object(
        'branch_limit', p.branch_limit, 'photo_limit', p.photo_limit,
        'description_limit', p.description_limit, 'show_links', p.show_links, 'analytics', p.analytics),
      'usage', jsonb_build_object(
        'branches_published', (select count(*) from public.business_branches br
           where br.business_id = b.id and br.published and not br.permanently_closed),
        'branches_hidden_by_plan', (select count(*) from public.business_branches br
           where br.business_id = b.id and br.plan_limited and not br.permanently_closed),
        'branches_total', (select count(*) from public.business_branches br
           where br.business_id = b.id and not br.permanently_closed),
        'photos', cardinality(b.photos) + (case when b.cover_url is null then 0 else 1 end),
        'links', (select count(*) from public.business_links l where l.business_id = b.id),
        'menu_items', (select count(*) from public.business_menu_items m where m.business_id = b.id)),
      'current', (select to_jsonb(s) - 'decided_by' - 'requested_by' - 'suspended_by'
                  from public.business_subscriptions s
                  where s.business_id = b.id and s.status in ('active', 'suspended')),
      'pending', (select to_jsonb(s) - 'decided_by' - 'requested_by' - 'suspended_by'
                  from public.business_subscriptions s where s.business_id = b.id and s.status = 'pending'),
      'activated_count', (select count(*) from public.business_subscriptions s
                  where s.business_id = b.id and s.starts_at is not null),
      'access_suspended', public.business_access_suspended(b.id),
      'suspension_reason', (select s.suspension_reason from public.business_subscriptions s
                  where s.business_id = b.id and s.status = 'suspended')
    ) j
    from public.businesses b
    join public.subscription_plans p on p.id = b.plan
    where b.id in (select o.business_id from public.business_owners o where o.email = v_email)
  ) x;
  return v_out;
end
$$;
revoke all on function public.owner_portal_overview() from public, anon;
grant execute on function public.owner_portal_overview() to authenticated;
