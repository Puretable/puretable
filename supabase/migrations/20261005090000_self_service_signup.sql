-- Replaces the "triggered by admin-approved paid plan" gate entirely with a self-service flow:
--   1. Anyone can create their own business + owner account via `signup_create_business` (open,
--      no admin approval) — the business starts unpublished, same as any admin-created business.
--   2. On first login the owner must accept the Partnership Agreement (merged with whatever is known
--      at that point — the business name and their own email; everything else shows as a blank, the
--      same way the source document shows an unfilled blank). This no longer depends on the billing
--      fields being filled in first.
--   3. Selecting a PAID package now requires `business_info_completed` (billing fields saved) — the
--      Free package, and package browsing in general, stay ungated.
-- None of this touches publishing (still a separate, deliberate admin action), invoicing (still
-- fully manual), or how a subscription request is actually approved (unchanged).

-- Every pre-existing business is "grandfathered in" as already agreed, so this never re-gates an
-- existing owner's dashboard the next time they log in.
update public.businesses
   set terms_accepted_at = now(), terms_version = 'legacy-import'
 where terms_accepted_at is null;

-- Restored to its pre-this-feature form: plan approval no longer touches business_info_completed.
create or replace function public.activate_subscription_internal(
  _id uuid, _ends_at timestamptz, _payment_status text, _actor uuid
)
returns public.business_subscriptions
language plpgsql security definer set search_path = ''
as $$
declare v_row public.business_subscriptions;
begin
  select * into v_row from public.business_subscriptions where id = _id for update;
  if not found then raise exception 'Subscription not found' using errcode = 'no_data_found'; end if;
  perform 1 from public.businesses where id = v_row.business_id for update;
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
  update public.businesses set plan = v_row.plan where id = v_row.business_id;
  perform set_config('pt.subscription_sync', '', true);
  return v_row;
end
$$;
revoke all on function public.activate_subscription_internal(uuid, timestamptz, text, uuid)
  from public, anon, authenticated;

-- Saving the billing fields is now the only step for this part: it completes immediately (it already
-- requires every field non-empty), instead of waiting for a separate "accept" call.
-- Only trade name + CR number are hard-required for now (packages/full invoicing details are
-- platform-disabled — see the `packages_enabled` toggle). The other fields (tax number, address,
-- email, phone, representative) stay as real optional columns, filled in whenever provided, so the
-- full form works unchanged the moment packages are re-enabled — nothing here needs to be rebuilt.
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
  update public.businesses
     set invoice_trade_name = btrim(_trade_name), invoice_cr_number = btrim(_cr_number),
         invoice_tax_number = coalesce(nullif(btrim(coalesce(_tax_number, '')), ''), invoice_tax_number),
         invoice_address = coalesce(nullif(btrim(coalesce(_address, '')), ''), invoice_address),
         invoice_email = coalesce(nullif(lower(btrim(coalesce(_email, ''))), ''), invoice_email),
         invoice_phone = coalesce(nullif(btrim(coalesce(_phone, '')), ''), invoice_phone),
         invoice_representative_name =
           coalesce(nullif(btrim(coalesce(_representative_name, '')), ''), invoice_representative_name),
         invoice_representative_title =
           coalesce(nullif(btrim(coalesce(_representative_title, '')), ''), invoice_representative_title),
         business_info_completed = true
   where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.save_business_billing_fields(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_business_billing_fields(uuid, text, text, text, text, text, text, text, text)
  to authenticated;

-- Accepting the agreement is now the first-login gate, independent of the billing fields: it only
-- requires ownership, not that any other field exist yet.
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

-- Surfaces terms_accepted_at (so the portal can decide whether to show the agreement gate) and
-- applies the temporary Premium-for-everyone override while packages are platform-disabled: the
-- entitlements shown are Premium's regardless of the business's real `plan`, which is left untouched.
create or replace function public.owner_portal_overview()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := public.current_owner_email();
  v_id uuid;
  v_out jsonb;
  v_packages_enabled boolean := coalesce(
    (select (s.sections->>'packages_enabled')::boolean from public.site_settings s where s.id = 'default'),
    false
  );
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
      'business_info_completed', b.business_info_completed, 'terms_accepted_at', b.terms_accepted_at,
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
    join public.subscription_plans p
      on p.id = (case when v_packages_enabled then b.plan else 'premium' end)
    where b.id in (select o.business_id from public.business_owners o where o.email = v_email)
  ) x;
  return v_out;
end
$$;
revoke all on function public.owner_portal_overview() from public, anon;
grant execute on function public.owner_portal_overview() to authenticated;

-- Requesting a paid plan now also requires the billing-info step to be complete — enforced here, not
-- just by disabling the button, since this function is reachable directly by any owner session.
create or replace function public.request_business_plan(_business_id uuid, _plan text, _period_months integer default 1)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_active public.business_subscriptions; v_row public.business_subscriptions;
begin
  if v_uid is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if public.business_access_suspended(_business_id) then
    raise exception 'Access suspended' using errcode = '42501';
  end if;
  if _plan not in ('free', 'pro', 'premium') then
    raise exception 'Unknown plan' using errcode = 'check_violation';
  end if;
  if _plan <> 'free' and _period_months not in (1, 12) then
    raise exception 'Invalid subscription period' using errcode = 'check_violation';
  end if;
  if _plan <> 'free' and not exists (
    select 1 from public.businesses where id = _business_id and business_info_completed
  ) then
    raise exception 'Billing info must be completed before subscribing to a paid plan'
      using errcode = 'check_violation';
  end if;
  perform public.reconcile_business_subscription(_business_id);
  perform 1 from public.businesses where id = _business_id for update;
  select * into v_active from public.business_subscriptions where business_id = _business_id and status = 'active';
  if found and v_active.plan = _plan then
    raise exception 'Already on this plan' using errcode = 'check_violation';
  end if;
  update public.business_subscriptions
     set status = 'cancelled', ended_at = now()
   where business_id = _business_id and status = 'pending';
  insert into public.business_subscriptions (business_id, plan, status, source, period_months, requested_by, payment_status)
  values (_business_id, _plan, 'pending', 'owner',
          case when _plan = 'free' then null else _period_months end, v_uid,
          case when _plan = 'free' then 'not_required' else 'unpaid' end)
  returning * into v_row;
  if _plan = 'free' then
    v_row := public.activate_subscription_internal(v_row.id, null, 'not_required', v_uid);
  end if;
  return to_jsonb(v_row) - 'decided_by' - 'requested_by' - 'suspended_by';
end
$$;
revoke all on function public.request_business_plan(uuid, text, integer) from public, anon;
grant execute on function public.request_business_plan(uuid, text, integer) to authenticated;

-- Fully open self-service signup: creates a new, unpublished business plus the owner link for the
-- given email, in one step. Callable by anon because it runs before any session exists (same as
-- requesting a login code today). The business starts exactly like any admin-created one — Free
-- plan (set by the existing sync trigger), unpublished until an admin reviews and publishes it, and
-- not yet agreement/info-complete. Input is re-validated here even though the app also validates it,
-- since this function is reachable directly by anyone with the anon key.
create or replace function public.signup_create_business(_business_name text, _email text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(_business_name, ''));
  v_email text := lower(btrim(coalesce(_email, '')));
  v_slug text;
  v_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 200 then
    raise exception 'Business name must be between 1 and 200 characters' using errcode = 'check_violation';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 320 then
    raise exception 'A valid email is required' using errcode = 'check_violation';
  end if;
  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'place'; end if;
  v_slug := v_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  -- business_info_completed defaults to true on this column (so the backfill never re-gates
  -- existing/admin-created businesses) — a fresh self-signup is explicitly the one case that must
  -- start false, so the owner actually goes through the agreement + minimal-info gate.
  insert into public.businesses (name, category, city, slug, published, business_info_completed)
  values (v_name, 'restaurant', 'Riyadh', v_slug, false, false)
  returning id into v_id;

  insert into public.business_owners (business_id, email) values (v_id, v_email);

  return v_id;
end
$$;
revoke all on function public.signup_create_business(text, text) from public;
grant execute on function public.signup_create_business(text, text) to anon, authenticated;
