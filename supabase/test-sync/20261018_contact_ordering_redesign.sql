-- Contact & ordering redesign — schema groundwork. TEST ONLY.
--
-- What this does:
--  1. Adds 4 columns to business_branches: pickup_enabled, delivery_enabled, delivery_url,
--     whatsapp_orders_enabled — the new per-branch ordering toggles.
--  2. Detects and reports duplicate business-level business_links rows for the two platforms that
--     move into the new design (tiktok, email) — NONE were found on TEST as of this writing (see
--     verification query below to re-check). If any exist when you run this, the DO block keeps
--     only the most recently created row per (business_id, platform) and leaves the rest alone
--     (not deleted) — see the notice it raises for exact counts before deciding whether to also run
--     the commented-out cleanup at the bottom. Nothing is deleted automatically.
--  3. Adds a partial unique index so a business cannot have two business-level (branch_id is null)
--     tiktok or email links going forward.
--  4. Backfills exactly one branch for every business that currently has zero branches, copying
--     (never moving) its existing name/phone/whatsapp/maps_url/lat/lng/address/city/district/hours
--     onto the new row. The business's own columns are left completely untouched — this is a copy,
--     not a move, so nothing existing can be lost. Every business therefore has >=1 branch after
--     this runs, which is what the new per-branch contact/ordering UI needs. Backfilled rows are
--     tagged place_id = '__default_branch__' so they can be identified or rolled back precisely.
--  5. Adds owner_sync_pickup_delivery_tags(business_id): a narrow, admin-free RPC an owner's own
--     session can call that recomputes ONLY the svc_pickup/svc_delivery tags in businesses.categories
--     from that business's branches (tag present if ANY branch has the matching toggle on) — this is
--     the sole path by which an owner can ever influence categories; it touches no other tag and
--     fails for a business the caller does not own. Admin's existing category editing is untouched
--     (admin still writes businesses.categories directly through their own authenticated session, as
--     today).
--
-- Arabic summary / ملخص بالعربي:
-- هذا الملف تحضير قاعدي لإعادة تصميم أزرار التواصل والطلب: يضيف 4 أعمدة جديدة لجدول الفروع (استلام،
-- توصيل، رابط التوصيل، تفعيل الطلب عبر واتساب لكل فرع)، يتأكد أنه لا يوجد تكرار في روابط تيك توك
-- والإيميل على مستوى المنشأة (لم أجد أي تكرار على TEST حالياً)، يمنع التكرار مستقبلاً، وينشئ فرعاً
-- افتراضياً واحداً (نسخ فقط، لا حذف ولا نقل) لكل منشأة ليس لها أي فرع حالياً — حتى تملك كل منشأة
-- فرعاً واحداً على الأقل تُبنى عليه الواجهة الجديدة. كما يضيف دالة آمنة وضيّقة جداً تسمح لصاحب
-- المنشأة بتحديث وسمي "استلام"/"توصيل" في قائمة التصنيفات تلقائياً بناءً على فروعه فقط، دون أي قدرة
-- على تغيير أي تصنيف آخر.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else. No production row data
-- touched or read.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
begin;
drop function if exists public.owner_sync_pickup_delivery_tags(uuid);
delete from public.business_branches where place_id = '__default_branch__';
drop index if exists business_links_business_level_unique;
alter table public.business_branches
  drop column if exists pickup_enabled,
  drop column if exists delivery_enabled,
  drop column if exists delivery_url,
  drop column if exists whatsapp_orders_enabled;
commit;
*/

-- ============================================================================
-- GUARD
-- ============================================================================
do $$
begin
  if not exists (select 1 from public.app_config where key = '__is_test_env') then
    raise exception
      'ABORT: __is_test_env marker not found. This file is for the TEST project only and must never run on PRODUCTION.';
  end if;
end $$;

-- ============================================================================
-- FIX — run this now, on TEST only.
-- ============================================================================
begin;

-- 1. New per-branch ordering columns.
alter table public.business_branches
  add column if not exists pickup_enabled boolean not null default false,
  add column if not exists delivery_enabled boolean not null default false,
  add column if not exists delivery_url text
    check (delivery_url is null or delivery_url ~ '^https://'),
  add column if not exists whatsapp_orders_enabled boolean not null default false;

-- 2. Report (never silently delete) any existing business-level tiktok/email duplicates.
do $$
declare
  v_dupe_groups integer;
  v_dupe_rows integer;
begin
  select count(*), coalesce(sum(cnt), 0) into v_dupe_groups, v_dupe_rows
  from (
    select business_id, platform, count(*) cnt
    from public.business_links
    where branch_id is null and platform in ('tiktok', 'email')
    group by business_id, platform
    having count(*) > 1
  ) x;
  raise notice 'business-level tiktok/email duplicate groups: %, rows involved: %', v_dupe_groups, v_dupe_rows;
end $$;

-- 3. Prevent future business-level tiktok/email duplicates. If the NOTICE above reported any
-- existing duplicates, this index creation will fail with a clear error — resolve them first (see
-- the commented cleanup query below) and re-run.
create unique index if not exists business_links_business_level_unique
  on public.business_links (business_id, platform)
  where branch_id is null and platform in ('tiktok', 'email');

-- Only if the notice above found duplicates and you want this file to keep the most recently
-- created row per group (nothing is ever deleted automatically — uncomment deliberately):
-- delete from public.business_links a using public.business_links b
--   where a.branch_id is null and a.platform in ('tiktok', 'email')
--     and b.branch_id is null and b.platform in ('tiktok', 'email')
--     and a.business_id = b.business_id and a.platform = b.platform
--     and a.created_at < b.created_at;

-- 4. One default branch per business that currently has zero branches — a copy of its own existing
-- contact fields, nothing removed or changed on businesses itself.
insert into public.business_branches (
  business_id, name, name_ar, address, address_ar, city, city_ar, district, district_ar, region,
  lat, lng, maps_url, phone, whatsapp, hours, published, place_id
)
select
  b.id, b.name, b.name_ar, b.address, b.address_ar, b.city, b.city_ar, b.district, b.district_ar,
  b.region, b.lat, b.lng, b.maps_url, b.phone, b.whatsapp, coalesce(b.hours, '{}'::jsonb), true,
  '__default_branch__'
from public.businesses b
where not exists (select 1 from public.business_branches br where br.business_id = b.id);

-- 5. Narrow RPC: an owner may only ever flip svc_pickup/svc_delivery, recomputed from their own
-- branches, never any other category tag.
create or replace function public.owner_sync_pickup_delivery_tags(_business_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pickup boolean;
  v_delivery boolean;
  v_categories text[];
begin
  if auth.uid() is null
     or not (public.is_business_owner(_business_id) or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select coalesce(bool_or(pickup_enabled), false), coalesce(bool_or(delivery_enabled), false)
    into v_pickup, v_delivery
  from public.business_branches
  where business_id = _business_id and not permanently_closed;

  select coalesce(categories, '{}'::text[]) into v_categories
  from public.businesses where id = _business_id for update;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;

  v_categories := array_remove(array_remove(v_categories, 'svc_pickup'), 'svc_delivery');
  if v_pickup then v_categories := array_append(v_categories, 'svc_pickup'); end if;
  if v_delivery then v_categories := array_append(v_categories, 'svc_delivery'); end if;

  update public.businesses set categories = v_categories where id = _business_id;
  return v_categories;
end
$$;
revoke all on function public.owner_sync_pickup_delivery_tags(uuid) from public, anon, authenticated;
grant execute on function public.owner_sync_pickup_delivery_tags(uuid) to authenticated;

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select count(*) from public.business_branches where place_id = '__default_branch__';
-- select business_id, platform, count(*) from public.business_links
--   where branch_id is null and platform in ('tiktok','email') group by 1,2 having count(*) > 1;
-- select indexname from pg_indexes where indexname = 'business_links_business_level_unique';
-- select has_function_privilege('authenticated', 'public.owner_sync_pickup_delivery_tags(uuid)', 'execute'); -- true
-- select has_function_privilege('anon', 'public.owner_sync_pickup_delivery_tags(uuid)', 'execute');           -- false
