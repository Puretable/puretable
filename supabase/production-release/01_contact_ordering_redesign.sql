-- PRODUCTION RELEASE — file 1 of 5. Run BEFORE the code deploy (purely additive: new columns with
-- defaults, a report-only check, a new unique index, a one-time backfill, and a new function old
-- code never calls). The currently-live production code keeps working unchanged after this runs.
--
-- Adds per-branch pickup/delivery/WhatsApp-ordering columns, a safety net against duplicate
-- business-level TikTok/email links, one default branch for any business that currently has zero
-- (copied from its own existing contact fields — nothing on `businesses` is touched), and a narrow
-- owner-callable function that can only ever recompute the svc_pickup/svc_delivery tags from that
-- business's own branches.
--
-- Arabic summary / ملخص بالعربي:
-- يضيف هذا الملف أعمدة الاستلام والتوصيل والطلب عبر واتساب لكل فرع، حماية من تكرار روابط تيك توك/
-- البريد على مستوى المنشأة، فرعاً افتراضياً واحداً لكل منشأة ليس لديها أي فرع حالياً (نسخة من بيانات
-- التواصل الموجودة أصلاً لديها، دون أي تغيير على جدول المنشآت نفسه)، ودالة ضيقة يستخدمها صاحب
-- المنشأة فقط لإعادة حساب وسمي "استلام"/"توصيل" من فروعه هو فقط. لا حذف ولا تعديل على بيانات حالية.
--
-- Target: PRODUCTION ONLY (gmuvmeypkfzbulxgujdu). See the guard below — it can only confirm the
-- INVERSE (this is not the TEST project); visually confirm the project ref in the Supabase dashboard
-- URL yourself before pasting, as the primary safeguard.

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
  if exists (select 1 from public.app_config where key = '__is_test_env') then
    raise exception
      'ABORT: __is_test_env marker found — this looks like the TEST project, not production. Confirm the project ref (gmuvmeypkfzbulxgujdu) in the dashboard URL before pasting.';
  end if;
end $$;

-- ============================================================================
-- FIX — additive only, safe before the code deploy.
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
-- VERIFICATION
-- ============================================================================
-- 1. New columns exist:
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='business_branches'
--     and column_name in ('pickup_enabled','delivery_enabled','delivery_url','whatsapp_orders_enabled');
--   -- expect 4 rows
--
-- 2. No business is left without at least one branch:
--   select count(*) from public.businesses b
--   where not exists (select 1 from public.business_branches br where br.business_id = b.id);
--   -- expect 0
--
-- 3. The new function exists and is owner/admin-only:
--   select has_function_privilege('authenticated', 'public.owner_sync_pickup_delivery_tags(uuid)', 'execute'); -- true
--   select has_function_privilege('anon', 'public.owner_sync_pickup_delivery_tags(uuid)', 'execute'); -- false
--
-- 4. The duplicate-prevention index exists:
--   select indexname from pg_indexes where indexname = 'business_links_business_level_unique';
