-- Syncs the TEST project's STRUCTURE to match PRODUCTION as of 2026-10-15. TEST only — never run
-- this on production. Adds: business_billing table, business_disclosure table, two menu-item
-- description columns, the admin_delete_business function, and updates five other functions to
-- their current production bodies. Also narrows businesses' column-level grants to match production
-- (TEST currently still has the old, wider table-level grant). No production row data is copied —
-- the one data-copy statement below (business_billing backfill) only copies TEST's OWN existing
-- fake invoice_* values into TEST's OWN new business_billing rows.
--
-- Arabic summary / ملخص بالعربي:
-- يزامن هذا الملف بنية قاعدة TEST مع PRODUCTION: يضيف جدول بيانات الفوترة الجديد، جدول الإفصاح
-- التجاري (موجود في production والكود لكن غائب عن TEST)، حقلي الوصف لأصناف القائمة، دالة حذف
-- المنشأة الآمنة، ويحدّث خمس دوال أخرى لتطابق آخر نسخة من production. كما يضيّق صلاحيات الأعمدة على
-- جدول businesses بنفس ما طُبّق على production. لا يُنسخ أي صف بيانات حقيقي من production — السطر
-- الوحيد الذي ينسخ بيانات ينسخ بيانات TEST نفسها (قيم الفوترة الوهمية الموجودة بالفعل في TEST) إلى
-- الجدول الجديد، وليس أي شيء من production.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else (see guard below).
--
-- Before running this file, run this once on TEST (creates the marker the guard checks for):
--   insert into public.app_config (key, value) values ('__is_test_env', 'true')
--   on conflict (key) do nothing;

-- ============================================================================
-- ROLLBACK — reverts TEST to its pre-sync state. Commented out; uncomment to run.
-- ============================================================================
/*
begin;

drop table if exists public.business_billing cascade;
drop table if exists public.business_disclosure cascade;

alter table public.business_menu_items
  drop column if exists description,
  drop column if exists description_ar;

drop function if exists public.admin_delete_business(uuid);

-- Restore the four billing-related functions to their pre-business_billing (invoice_* column) bodies.
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
        'description_limit', p.description_limit, 'show_links', p.show_links, 'analytics', p.analytics,
        'featured', (p.id = 'premium'), 'menu', (p.id <> 'free')),
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

revoke select on public.businesses from anon, authenticated;
grant select on public.businesses to anon, authenticated;

commit;
*/

-- ============================================================================
-- GUARD — aborts immediately if the TEST-only marker is missing (i.e. this is not TEST).
-- ============================================================================
do $$
begin
  if not exists (select 1 from public.app_config where key = '__is_test_env') then
    raise exception
      'ABORT: __is_test_env marker not found. This file is for the TEST project only and must never run on PRODUCTION. Create the marker on TEST first (see the comment at the top of this file), then re-run.';
  end if;
end $$;

-- ============================================================================
-- SYNC — run this now, on TEST only.
-- ============================================================================
begin;

-- 1. business_billing table (RLS + grants), same as production's 20261015090000.
create table if not exists public.business_billing (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  trade_name text,
  cr_number text,
  tax_number text,
  address text,
  email text,
  phone text,
  representative_name text,
  representative_title text,
  status text not null default 'not_sent' check (status in ('sent', 'not_sent')),
  updated_at timestamptz not null default now()
);
alter table public.business_billing enable row level security;

drop policy if exists business_billing_owner_read on public.business_billing;
create policy business_billing_owner_read on public.business_billing for select to authenticated
using (
  exists (
    select 1 from public.business_owners o
    where o.business_id = business_billing.business_id
      and o.email = public.current_owner_email()
  )
);

drop policy if exists business_billing_admin_all on public.business_billing;
create policy business_billing_admin_all on public.business_billing for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

revoke all on public.business_billing from public, anon;
grant select on public.business_billing to authenticated;
grant all on public.business_billing to service_role;

-- One-time backfill: copies TEST's OWN existing (fake) invoice_* values on TEST's OWN businesses
-- rows into the new table. Copies nothing from production.
insert into public.business_billing (
  business_id, trade_name, cr_number, tax_number, address, email, phone,
  representative_name, representative_title, status, updated_at
)
select id, invoice_trade_name, invoice_cr_number, invoice_tax_number, invoice_address, invoice_email,
       invoice_phone, invoice_representative_name, invoice_representative_title,
       coalesce(invoice_status, 'not_sent'), now()
from public.businesses
where invoice_trade_name is not null or invoice_cr_number is not null or invoice_status is not null
on conflict (business_id) do nothing;

-- 2. business_disclosure table — exists in production and is used by the live code
-- (src/lib/disclosure.functions.ts, src/routes/disclosure.tsx) but was never created in TEST.
create table if not exists public.business_disclosure (
  id text primary key default 'default' check (id = 'default'),
  active boolean not null default false,
  business_name text check (business_name is null or char_length(business_name) <= 200),
  owner_name text check (owner_name is null or char_length(owner_name) <= 200),
  cr_number text check (cr_number is null or char_length(cr_number) <= 50),
  address text check (address is null or char_length(address) <= 300),
  email text check (email is null or char_length(email) <= 255),
  phone text check (phone is null or char_length(phone) <= 40),
  updated_at timestamptz not null default now(),
  check (
    not active
    or (business_name is not null and btrim(business_name) <> ''
        and cr_number is not null and btrim(cr_number) <> '')
  )
);
insert into public.business_disclosure (id) values ('default') on conflict (id) do nothing;

drop trigger if exists business_disclosure_set_updated_at on public.business_disclosure;
create trigger business_disclosure_set_updated_at before update on public.business_disclosure
for each row execute function public.set_updated_at();

alter table public.business_disclosure enable row level security;
revoke all on public.business_disclosure from anon, authenticated;
grant select on public.business_disclosure to anon, authenticated;
grant update on public.business_disclosure to authenticated;
grant all on public.business_disclosure to service_role;

drop policy if exists business_disclosure_public_read on public.business_disclosure;
create policy business_disclosure_public_read on public.business_disclosure for select to anon, authenticated
using (active);

drop policy if exists business_disclosure_admin_read on public.business_disclosure;
create policy business_disclosure_admin_read on public.business_disclosure for select to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

drop policy if exists business_disclosure_admin_write on public.business_disclosure;
create policy business_disclosure_admin_write on public.business_disclosure for update to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

-- 3. business_menu_items description columns.
alter table public.business_menu_items
  add column if not exists description text check (description is null or char_length(description) <= 500),
  add column if not exists description_ar text check (description_ar is null or char_length(description_ar) <= 500);

-- 4. Current production function bodies.
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
  update public.businesses
     set terms_accepted_at = now(), terms_version = _terms_version
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
      'terms_version', b.terms_version,
      'entitlements', jsonb_build_object(
        'branch_limit', p.branch_limit, 'photo_limit', p.photo_limit,
        'description_limit', p.description_limit, 'show_links', p.show_links, 'analytics', p.analytics,
        'featured', (p.id = 'premium'), 'menu', (p.id <> 'free')),
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

-- 5. admin_delete_business — new function, missing entirely from TEST.
create or replace function public.admin_delete_business(_business_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.favorites where business_id = _business_id;
  delete from public.businesses where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.admin_delete_business(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_business(uuid) to authenticated;

-- 6. favorites_log_analytics trigger — re-created idempotently for certainty; unchanged by today's
-- work, included only to guarantee parity, not because it was found missing.
alter table public.analytics_events
  add column if not exists dedupe_key text
  check (dedupe_key is null or length(dedupe_key) between 16 and 128);
create unique index if not exists analytics_events_dedupe_key
  on public.analytics_events (dedupe_key);

create or replace function public.log_favorite_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.analytics_events (
      event_type, business_id, is_admin, metadata, dedupe_key, created_at
    ) values (
      'favorite_add', new.business_id,
      coalesce(public.has_role(auth.uid(), 'admin'), false),
      jsonb_build_object('source', 'favorites_trigger'),
      'favorite-add:' || new.id::text, new.created_at
    ) on conflict (dedupe_key) do nothing;
    return new;
  end if;

  insert into public.analytics_events (
    event_type, business_id, is_admin, metadata, dedupe_key
  ) values (
    'favorite_remove', old.business_id,
    coalesce(public.has_role(auth.uid(), 'admin'), false),
    jsonb_build_object('source', 'favorites_trigger'),
    'favorite-remove:' || old.id::text
  ) on conflict (dedupe_key) do nothing;
  return old;
end
$$;
revoke all on function public.log_favorite_analytics() from public, anon, authenticated;

drop trigger if exists favorites_log_analytics on public.favorites;
create trigger favorites_log_analytics
after insert or delete on public.favorites
for each row execute function public.log_favorite_analytics();

-- 7. businesses column-level grants (TEST currently has the old, wider table-level grant).
revoke select on public.businesses from anon, authenticated;
grant select (
  id, slug, name, name_ar, category, categories, safety, region, city, cities, city_ar, district,
  district_ar, address, address_ar, lat, lng, phone, whatsapp, instagram, website, maps_url,
  cover_url, photos, description, description_ar, products, products_ar, hours, plan,
  offers_booking, discount_code, verified, dedicated_gf, shared_kitchen, precautions_note,
  no_location, published, created_at, updated_at, terms_accepted_at, terms_version,
  business_info_completed
) on public.businesses to anon, authenticated;
grant select (needs_review, review_notes) on public.businesses to authenticated;

-- 8. site_settings column-level grant — included idempotently; TEST should already have this from
-- the original baseline migration, re-running it is a safe no-op either way.
revoke select on public.site_settings from anon, authenticated;
grant select (id, theme, content, sections, layout, created_at, updated_at) on public.site_settings
  to anon, authenticated;

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select to_regclass('public.business_billing') is not null as business_billing_exists;
-- select to_regclass('public.business_disclosure') is not null as business_disclosure_exists;
-- select column_name from information_schema.columns
--   where table_name = 'business_menu_items' and column_name in ('description', 'description_ar');
-- select has_function_privilege('authenticated', 'public.admin_delete_business(uuid)', 'execute'); -- true
-- select has_function_privilege('anon', 'public.admin_delete_business(uuid)', 'execute');           -- false
-- select prosrc from pg_proc where proname = 'accept_partnership_agreement'; -- must NOT mention business_billing
