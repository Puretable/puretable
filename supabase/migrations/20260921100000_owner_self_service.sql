-- Owner self-service: gluten-free menu items, owner read access, and admin suspend/reactivate.
-- Additive only: creates one table, adds nullable columns and policies, and replaces functions
-- introduced by 20260920100000_business_owner_portal.sql. No existing rows are modified.
--
-- Owners never write tables directly. Every owner change goes through a server function that
-- checks `owner_access_state()` and whitelists fields; there are deliberately no owner write policies.

-- ---------------------------------------------------------------------------
-- Gluten-free menu items (available on every plan)
-- ---------------------------------------------------------------------------
create table public.business_menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  name_ar text check (name_ar is null or char_length(name_ar) <= 120),
  price numeric(10, 2) check (price is null or (price >= 0 and price <= 100000)),
  currency text not null default 'SAR' check (char_length(currency) = 3),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 1000 and photo_url ~ '^https://')),
  -- Same three-colour system already used across the site: green = dedicated / safe,
  -- orange = shared kitchen, red = gluten-free option, confirm with staff first.
  safety text not null default 'red' check (safety in ('green', 'orange', 'red')),
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_menu_items_business_idx
  on public.business_menu_items (business_id, sort_order, created_at);

create trigger business_menu_items_set_updated_at before update on public.business_menu_items
for each row execute function public.set_updated_at();

create or replace function public.enforce_menu_item_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.business_menu_items where business_id = new.business_id) >= 200 then
    raise exception 'Menu item limit reached (maximum 200)' using errcode = 'check_violation';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_menu_item_limit() from public, anon, authenticated;
create trigger enforce_menu_item_limit before insert on public.business_menu_items
for each row execute function public.enforce_menu_item_limit();

alter table public.business_menu_items enable row level security;
revoke all on public.business_menu_items from anon, authenticated;
grant select on public.business_menu_items to anon, authenticated;
-- Write grants exist only so admin policies can work; owners have no write policy.
grant insert, update, delete on public.business_menu_items to authenticated;
grant all on public.business_menu_items to service_role;

create policy menu_items_public_read on public.business_menu_items for select to anon, authenticated
using (exists (select 1 from public.businesses b where b.id = business_id and b.published));
create policy menu_items_owner_read on public.business_menu_items for select to authenticated
using (business_id in (
  select o.business_id from public.business_owners o where o.email = (select public.current_owner_email())
));
create policy menu_items_admin_all on public.business_menu_items for all to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

-- ---------------------------------------------------------------------------
-- Owners can read everything about their own business (including unpublished and
-- plan-hidden rows) so the portal can show it. Reads only.
-- ---------------------------------------------------------------------------
create policy businesses_owner_read on public.businesses for select to authenticated
using (id in (
  select o.business_id from public.business_owners o where o.email = (select public.current_owner_email())
));
create policy branches_owner_read on public.business_branches for select to authenticated
using (business_id in (
  select o.business_id from public.business_owners o where o.email = (select public.current_owner_email())
));
create policy links_owner_read on public.business_links for select to authenticated
using (business_id in (
  select o.business_id from public.business_owners o where o.email = (select public.current_owner_email())
));

-- ---------------------------------------------------------------------------
-- Admin suspend / reactivate
-- ---------------------------------------------------------------------------
alter table public.business_subscriptions
  add column suspended_at timestamptz,
  add column suspended_by uuid references auth.users(id) on delete set null,
  add column suspension_reason text check (suspension_reason is null or char_length(suspension_reason) <= 500);

-- Replace the status list (constraint name is discovered rather than assumed).
do $$
declare c text; dropped integer := 0;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.business_subscriptions'::regclass and contype = 'c'
      -- Only the `status` list. `payment_status` also mentions "pending", so anchor on "((status =".
      and pg_get_constraintdef(oid) like '%((status = ANY%'
  loop
    execute format('alter table public.business_subscriptions drop constraint %I', c);
    dropped := dropped + 1;
  end loop;
  -- Abort the whole migration rather than leave the old status list in place.
  if dropped <> 1 then
    raise exception 'Expected to replace exactly one status constraint, replaced %', dropped;
  end if;
end
$$;
alter table public.business_subscriptions
  add constraint business_subscriptions_status_check
  check (status in ('pending', 'active', 'suspended', 'expired', 'superseded', 'cancelled', 'rejected'));
alter table public.business_subscriptions
  add constraint business_subscriptions_suspended_check
  check (status <> 'suspended' or (starts_at is not null and suspended_at is not null));

-- A business has at most one current subscription: active OR suspended.
drop index public.business_subscriptions_one_active;
create unique index business_subscriptions_one_current
  on public.business_subscriptions (business_id) where status in ('active', 'suspended');

create or replace function public.business_access_suspended(_business_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.business_subscriptions where business_id = _business_id and status = 'suspended'
  )
$$;
revoke all on function public.business_access_suspended(uuid) from public, anon, authenticated;

-- What the caller may do for a business: 'ok' | 'suspended' | 'forbidden'.
create or replace function public.owner_access_state(_business_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null or not public.is_business_owner(_business_id) then 'forbidden'
    when public.business_access_suspended(_business_id) then 'suspended'
    else 'ok'
  end
$$;
revoke all on function public.owner_access_state(uuid) from public, anon;
grant execute on function public.owner_access_state(uuid) to authenticated;

create or replace function public.admin_suspend_business_access(_business_id uuid, _reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_row public.business_subscriptions; v_name text;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if _reason is not null and char_length(_reason) > 500 then
    raise exception 'Reason is too long' using errcode = 'check_violation';
  end if;
  select name into v_name from public.businesses where id = _business_id for update;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
  perform public.reconcile_business_subscription(_business_id);
  select * into v_row from public.business_subscriptions
   where business_id = _business_id and status in ('active', 'suspended') for update;
  if not found then
    raise exception 'No current subscription to suspend' using errcode = 'no_data_found';
  end if;
  if v_row.status = 'suspended' then
    raise exception 'Already suspended' using errcode = 'check_violation';
  end if;
  perform set_config('pt.subscription_sync', '1', true);
  update public.business_subscriptions
     set status = 'suspended', suspended_at = now(), suspended_by = auth.uid(),
         suspension_reason = nullif(btrim(_reason), '')
   where id = v_row.id
   returning * into v_row;
  -- Paid features stop immediately; existing triggers hide branches beyond the Free limit (never deleted).
  update public.businesses set plan = 'free' where id = _business_id and plan <> 'free';
  perform set_config('pt.subscription_sync', '', true);
  insert into public.admin_audit_log (user_id, user_email, action, entity, entity_id, entity_label, details)
  values (auth.uid(), auth.jwt() ->> 'email', 'suspend_business_access', 'business_subscription',
          v_row.id::text, v_name,
          jsonb_build_object('business_id', _business_id, 'plan', v_row.plan, 'reason', v_row.suspension_reason));
  return to_jsonb(v_row) - 'decided_by' - 'requested_by' - 'suspended_by';
end
$$;
revoke all on function public.admin_suspend_business_access(uuid, text) from public, anon;
grant execute on function public.admin_suspend_business_access(uuid, text) to authenticated;

create or replace function public.admin_reactivate_business_access(_business_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_row public.business_subscriptions; v_name text; v_paused interval;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select name into v_name from public.businesses where id = _business_id for update;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
  select * into v_row from public.business_subscriptions
   where business_id = _business_id and status = 'suspended' for update;
  if not found then
    raise exception 'Business access is not suspended' using errcode = 'check_violation';
  end if;
  v_paused := now() - v_row.suspended_at;
  perform set_config('pt.subscription_sync', '1', true);
  -- The owner is not charged for the suspended period: the end date moves out by the same amount.
  update public.business_subscriptions
     set status = 'active',
         ends_at = case when ends_at is null then null else ends_at + v_paused end,
         suspended_at = null, suspended_by = null, suspension_reason = null
   where id = v_row.id
   returning * into v_row;
  update public.businesses set plan = v_row.plan where id = _business_id;
  perform set_config('pt.subscription_sync', '', true);
  insert into public.admin_audit_log (user_id, user_email, action, entity, entity_id, entity_label, details)
  values (auth.uid(), auth.jwt() ->> 'email', 'reactivate_business_access', 'business_subscription',
          v_row.id::text, v_name,
          jsonb_build_object('business_id', _business_id, 'plan', v_row.plan, 'suspended_for', v_paused::text));
  return to_jsonb(v_row) - 'decided_by' - 'requested_by' - 'suspended_by';
end
$$;
revoke all on function public.admin_reactivate_business_access(uuid) from public, anon;
grant execute on function public.admin_reactivate_business_access(uuid) to authenticated;

-- A plan changed outside the portal while access is suspended would otherwise fail with an
-- obscure unique-index error; say what to do instead.
create or replace function public.sync_business_subscription()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('pt.subscription_sync', true) = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.business_subscriptions where business_id = new.id and status = 'suspended') then
      raise exception 'Reactivate the suspended subscription before changing the plan'
        using errcode = 'check_violation';
    end if;
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

-- ---------------------------------------------------------------------------
-- Owner functions: refuse while suspended, and report the suspension to the portal.
-- ---------------------------------------------------------------------------
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

create or replace function public.cancel_plan_request(_business_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_business_owner(_business_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if public.business_access_suspended(_business_id) then
    raise exception 'Access suspended' using errcode = '42501';
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
  if public.business_access_suspended(v_row.business_id) then
    raise exception 'Reactivate the suspended access before activating a new plan'
      using errcode = 'check_violation';
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
