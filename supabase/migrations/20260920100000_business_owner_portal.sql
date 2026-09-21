-- Business Owner Portal.
-- Reuses businesses.plan + subscription_plans for feature limits. Adds:
--   * business_owners        admin-assigned owner emails (ownership is never self-claimed)
--   * business_subscriptions history of plan requests/activations, payment-ready but with no payment logic
-- Owners never write tables directly; every owner mutation is a checked RPC.

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------
create table public.business_owners (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and char_length(email) <= 320
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, email)
);
create index business_owners_email_idx on public.business_owners (email);

-- The caller's email, but only when Supabase has verified it. This blocks anyone who
-- registers an unverified account with someone else's address from claiming ownership.
create or replace function public.current_owner_email()
returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;
revoke all on function public.current_owner_email() from public, anon;
grant execute on function public.current_owner_email() to authenticated, service_role;

create or replace function public.is_business_owner(_business_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.business_owners o
    where o.business_id = _business_id and o.email = public.current_owner_email()
  )
$$;
revoke all on function public.is_business_owner(uuid) from public, anon;
grant execute on function public.is_business_owner(uuid) to authenticated, service_role;

alter table public.business_owners enable row level security;
revoke all on public.business_owners from anon, authenticated;
grant select, insert, delete on public.business_owners to authenticated;
grant all on public.business_owners to service_role;
create policy business_owners_own_read on public.business_owners for select to authenticated
using (email = (select public.current_owner_email()));
create policy business_owners_admin_all on public.business_owners for all to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

-- ---------------------------------------------------------------------------
-- Subscription history
-- ---------------------------------------------------------------------------
create table public.business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  plan text not null references public.subscription_plans(id),
  status text not null check (status in ('pending','active','expired','superseded','cancelled','rejected')),
  source text not null default 'owner' check (source in ('owner','admin','legacy','system')),
  period_months integer check (period_months in (1, 12)),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  starts_at timestamptz,
  ends_at timestamptz,
  ended_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  -- Payment-ready fields. No payment is processed yet; a provider can fill these later.
  payment_status text not null default 'unpaid'
    check (payment_status in ('not_required','unpaid','pending','paid','failed','refunded')),
  payment_provider text check (payment_provider is null or char_length(payment_provider) <= 60),
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 200),
  amount_halalas integer check (amount_halalas is null or amount_halalas >= 0),
  currency text not null default 'SAR' check (char_length(currency) = 3),
  notes text check (notes is null or char_length(notes) <= 500),
  check (status <> 'active' or starts_at is not null),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index business_subscriptions_business_idx on public.business_subscriptions (business_id, requested_at desc);
create index business_subscriptions_pending_idx on public.business_subscriptions (requested_at) where status = 'pending';
create unique index business_subscriptions_one_active on public.business_subscriptions (business_id) where status = 'active';
create unique index business_subscriptions_one_pending on public.business_subscriptions (business_id) where status = 'pending';

alter table public.business_subscriptions enable row level security;
revoke all on public.business_subscriptions from anon, authenticated;
grant select on public.business_subscriptions to authenticated;
grant all on public.business_subscriptions to service_role;
create policy business_subscriptions_read on public.business_subscriptions for select to authenticated
using (
  (select public.is_business_owner(business_id))
  or (select public.has_role((select auth.uid()), 'admin'))
);

-- Give every existing business one active row that mirrors its current plan.
insert into public.business_subscriptions (business_id, plan, status, source, starts_at, payment_status)
select b.id, b.plan, 'active', 'legacy', b.created_at, 'not_required'
from public.businesses b
where not exists (
  select 1 from public.business_subscriptions s where s.business_id = b.id and s.status = 'active'
);

-- Keep history truthful when businesses.plan changes outside the portal
-- (the existing admin "apply plan" control) or when a business is created.
create or replace function public.sync_business_subscription()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('pt.subscription_sync', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    update public.business_subscriptions
       set status = 'superseded', ended_at = now()
     where business_id = new.id and status = 'active';
  end if;
  insert into public.business_subscriptions (business_id, plan, status, source, starts_at, payment_status)
  values (new.id, new.plan, 'active', case when tg_op = 'INSERT' then 'system' else 'admin' end,
          case when tg_op = 'INSERT' then new.created_at else now() end, 'not_required');
  return new;
end
$$;
revoke all on function public.sync_business_subscription() from public, anon, authenticated;
create trigger sync_business_subscription_insert after insert on public.businesses
for each row execute function public.sync_business_subscription();
create trigger sync_business_subscription_update after update of plan on public.businesses
for each row when (old.plan is distinct from new.plan) execute function public.sync_business_subscription();

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by API roles)
-- ---------------------------------------------------------------------------
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
revoke all on function public.activate_subscription_internal(uuid, timestamptz, text, uuid) from public, anon, authenticated;

-- Expire one business's due subscription and fall back to Free.
create or replace function public.reconcile_business_subscription(_business_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.business_subscriptions
    where business_id = _business_id and status = 'active' and ends_at is not null and ends_at <= now()
  ) then
    return;
  end if;
  perform 1 from public.businesses where id = _business_id for update;
  perform set_config('pt.subscription_sync', '1', true);
  update public.business_subscriptions
     set status = 'expired', ended_at = ends_at
   where business_id = _business_id and status = 'active' and ends_at is not null and ends_at <= now();
  if not exists (
    select 1 from public.business_subscriptions where business_id = _business_id and status = 'active'
  ) then
    insert into public.business_subscriptions (business_id, plan, status, source, starts_at, payment_status)
    values (_business_id, 'free', 'active', 'system', now(), 'not_required');
    update public.businesses set plan = 'free' where id = _business_id and plan <> 'free';
  end if;
  perform set_config('pt.subscription_sync', '', true);
end
$$;
revoke all on function public.reconcile_business_subscription(uuid) from public, anon, authenticated;

-- Scheduled sweep (service role only, called by the daily cron endpoint).
create or replace function public.expire_due_subscriptions()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_count integer := 0;
begin
  for v_id in
    select distinct business_id from public.business_subscriptions
    where status = 'active' and ends_at is not null and ends_at <= now()
  loop
    perform public.reconcile_business_subscription(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;
revoke all on function public.expire_due_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_due_subscriptions() to service_role;

-- ---------------------------------------------------------------------------
-- Owner API
-- ---------------------------------------------------------------------------
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
        'links', (select count(*) from public.business_links l where l.business_id = b.id)),
      'current', (select to_jsonb(s) - 'decided_by' - 'requested_by'
                  from public.business_subscriptions s where s.business_id = b.id and s.status = 'active'),
      'pending', (select to_jsonb(s) - 'decided_by' - 'requested_by'
                  from public.business_subscriptions s where s.business_id = b.id and s.status = 'pending'),
      'activated_count', (select count(*) from public.business_subscriptions s
                  where s.business_id = b.id and s.starts_at is not null)
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

create or replace function public.request_business_plan(_business_id uuid, _plan text, _period_months integer default 1)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_active public.business_subscriptions; v_row public.business_subscriptions;
begin
  if v_uid is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _plan not in ('free', 'pro', 'premium') then
    raise exception 'Unknown plan' using errcode = 'check_violation';
  end if;
  if _plan <> 'free' and _period_months not in (1, 12) then
    raise exception 'Invalid subscription period' using errcode = 'check_violation';
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
  -- Moving down to Free needs no payment or approval.
  if _plan = 'free' then
    v_row := public.activate_subscription_internal(v_row.id, null, 'not_required', v_uid);
  end if;
  return to_jsonb(v_row) - 'decided_by' - 'requested_by';
end
$$;
revoke all on function public.request_business_plan(uuid, text, integer) from public, anon;
grant execute on function public.request_business_plan(uuid, text, integer) to authenticated;

create or replace function public.cancel_plan_request(_business_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.business_subscriptions
     set status = 'cancelled', ended_at = now()
   where business_id = _business_id and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function public.cancel_plan_request(uuid) from public, anon;
grant execute on function public.cancel_plan_request(uuid) to authenticated;

-- Analytics follow the plan: none = refused, basic = totals, full = totals + breakdown + comparison.
create or replace function public.owner_business_report(_business_id uuid, _days integer default 30)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_level text; v_since timestamptz; v_prev timestamptz; v_out jsonb;
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _days not in (7, 30, 90) then
    raise exception 'Invalid range' using errcode = 'check_violation';
  end if;
  select p.analytics into v_level
  from public.businesses b join public.subscription_plans p on p.id = b.plan
  where b.id = _business_id;
  if v_level is null or v_level = 'none' then
    raise exception 'Plan does not include analytics' using errcode = '42501';
  end if;
  v_since := now() - make_interval(days => _days);
  v_prev := v_since - make_interval(days => _days);
  with ev as (
    select event_type, created_at from public.analytics_events
    where not is_admin and business_id = _business_id and created_at >= v_since
  ), daily as (
    select (created_at at time zone 'Asia/Riyadh')::date d,
      count(*) filter (where event_type = 'page_view') views,
      count(*) filter (where event_type like 'click%') clicks
    from ev group by 1
  )
  select jsonb_build_object(
    'level', v_level, 'days', _days,
    'views', count(*) filter (where event_type = 'page_view'),
    'impressions', count(*) filter (where event_type = 'impression'),
    'clicks', count(*) filter (where event_type like 'click%'),
    'contactClicks', count(*) filter (where event_type in ('click_whatsapp','click_website','click_phone'))
  ) || case when v_level = 'full' then jsonb_build_object(
    'maps', count(*) filter (where event_type = 'click_maps'),
    'delivery', count(*) filter (where event_type = 'click_delivery'),
    'booking', count(*) filter (where event_type = 'click_booking'),
    'whatsapp', count(*) filter (where event_type = 'click_whatsapp'),
    'website', count(*) filter (where event_type = 'click_website'),
    'phone', count(*) filter (where event_type = 'click_phone'),
    'social', count(*) filter (where event_type = 'click_social'),
    'favorites', count(*) filter (where event_type = 'favorite_add'),
    'previous', (select jsonb_build_object(
        'views', count(*) filter (where e.event_type = 'page_view'),
        'clicks', count(*) filter (where e.event_type like 'click%'))
      from public.analytics_events e
      where not e.is_admin and e.business_id = _business_id and e.created_at >= v_prev and e.created_at < v_since),
    'timeseries', (select coalesce(jsonb_agg(jsonb_build_object(
        'date', to_char(d, 'YYYY-MM-DD'), 'views', views, 'clicks', clicks) order by d), '[]'::jsonb) from daily)
  ) else '{}'::jsonb end
  into v_out
  from ev;
  return v_out;
end
$$;
revoke all on function public.owner_business_report(uuid, integer) from public, anon;
grant execute on function public.owner_business_report(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin API (activation is a manual decision until payment exists)
-- ---------------------------------------------------------------------------
create or replace function public.admin_activate_subscription(
  _id uuid, _ends_at timestamptz default null, _payment_status text default 'not_required'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_row public.business_subscriptions; v_ends timestamptz; v_name text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _payment_status not in ('not_required', 'paid') then
    raise exception 'Invalid payment status' using errcode = 'check_violation';
  end if;
  select * into v_row from public.business_subscriptions where id = _id;
  if not found then raise exception 'Subscription not found' using errcode = 'no_data_found'; end if;
  if v_row.status <> 'pending' then
    raise exception 'Only pending requests can be activated' using errcode = 'check_violation';
  end if;
  v_ends := case when v_row.plan = 'free' then null
                 else coalesce(_ends_at, now() + make_interval(months => coalesce(v_row.period_months, 1))) end;
  if v_ends is not null and v_ends <= now() then
    raise exception 'End date must be in the future' using errcode = 'check_violation';
  end if;
  v_row := public.activate_subscription_internal(_id, v_ends, _payment_status, auth.uid());
  select name into v_name from public.businesses where id = v_row.business_id;
  insert into public.admin_audit_log (user_id, user_email, action, entity, entity_id, entity_label, details)
  values (auth.uid(), auth.jwt() ->> 'email', 'activate_subscription', 'business_subscription',
          v_row.id::text, v_name,
          jsonb_build_object('business_id', v_row.business_id, 'plan', v_row.plan, 'ends_at', v_row.ends_at,
                             'payment_status', v_row.payment_status));
  return to_jsonb(v_row);
end
$$;
revoke all on function public.admin_activate_subscription(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_activate_subscription(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_reject_subscription(_id uuid, _note text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_row public.business_subscriptions; v_name text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _note is not null and char_length(_note) > 500 then
    raise exception 'Note is too long' using errcode = 'check_violation';
  end if;
  update public.business_subscriptions
     set status = 'rejected', ended_at = now(), decided_by = auth.uid(), decided_at = now(), notes = _note
   where id = _id and status = 'pending'
   returning * into v_row;
  if not found then
    raise exception 'Only pending requests can be rejected' using errcode = 'check_violation';
  end if;
  select name into v_name from public.businesses where id = v_row.business_id;
  insert into public.admin_audit_log (user_id, user_email, action, entity, entity_id, entity_label, details)
  values (auth.uid(), auth.jwt() ->> 'email', 'reject_subscription', 'business_subscription',
          v_row.id::text, v_name, jsonb_build_object('business_id', v_row.business_id, 'plan', v_row.plan));
  return to_jsonb(v_row);
end
$$;
revoke all on function public.admin_reject_subscription(uuid, text) from public, anon;
grant execute on function public.admin_reject_subscription(uuid, text) to authenticated;
