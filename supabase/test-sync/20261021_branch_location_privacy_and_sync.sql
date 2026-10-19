-- Branch-level coordinates: home-business privacy at the DATA layer (not just the UI), plus an
-- auto-sync so businesses.city/city_ar/district/district_ar stay correct once the business-level
-- "location box" is removed from the owner portal and admin page (every branch keeps its own
-- location; the business-level fields become a derived mirror of the primary branch instead of
-- something typed by hand). TEST ONLY.
--
-- Why a DB-level fix for coordinates (not just hiding the map in the UI):
-- businesses.lat/lng and business_branches.lat/lng are both granted to `anon` as plain columns
-- today (see 20261015120000_fix_businesses_column_grants.sql for businesses; business_branches
-- still has its original blanket `grant select ... to anon` from the baseline migration). That
-- means a direct PostgREST call — not just the app's own pages — can already read a home
-- business's exact coordinates. Revoking those two columns from `anon` and replacing them with two
-- SECURITY DEFINER functions that return null coordinates for home-category businesses closes that
-- gap at the source. `authenticated` (owners, admins) keeps full column access exactly as before —
-- nothing changes for the owner portal or admin pages.
--
-- Arabic summary / ملخص بالعربي:
-- يضيف هذا الملف حماية خصوصية على مستوى قاعدة البيانات نفسها (وليس فقط الواجهة) للمنشآت المصنّفة
-- "أسر منتجة": يمنع أي طلب مباشر لقاعدة البيانات (ليس فقط صفحات الموقع) من قراءة الإحداثيات الدقيقة
-- لهذه المنشآت — يُعاد بدلاً منها "لا يوجد" (null)، بينما تبقى المدينة/الحي ظاهرَين كالمعتاد.
-- لا يتأثر دخول المالك أو الإدارة إطلاقاً، فقط الوصول العام (anon). كما يضيف مزامنة تلقائية: مدينة
-- وحي المنشأة (الحقول التي يعرضها بعض الصفحات والتقارير) تُحسب تلقائياً من الفرع الأساسي للمنشأة
-- بدل إدخالها يدوياً، بما أن مربع "الموقع" على مستوى المنشأة أُزيل من بوابة المالك وصفحة الإدارة.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
begin;
drop trigger if exists sync_business_location_from_branches on public.business_branches;
drop function if exists public.sync_business_location_from_branches();
drop function if exists public.public_business_coordinates();
drop function if exists public.public_branch_coordinates();

revoke select on public.businesses from anon;
grant select (
  id, slug, name, name_ar, category, categories, safety, region, city, cities, city_ar, district,
  district_ar, address, address_ar, lat, lng, phone, whatsapp, instagram, website, maps_url,
  cover_url, photos, description, description_ar, products, products_ar, hours, plan,
  offers_booking, discount_code, verified, dedicated_gf, shared_kitchen, precautions_note,
  no_location, published, created_at, updated_at, terms_accepted_at, terms_version,
  business_info_completed
) on public.businesses to anon;

revoke select on public.business_branches from anon, authenticated;
grant select on public.business_branches to anon, authenticated;
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

-- 1) Redacted coordinate access for anon: null lat/lng for home-category businesses, real values
--    for everyone else. SECURITY DEFINER so it can read the base tables regardless of the column
--    revokes below.
create or replace function public.public_business_coordinates()
returns table(business_id uuid, lat double precision, lng double precision)
language sql stable security definer set search_path = ''
as $$
  select
    id,
    case when category = 'home' or categories @> array['home']::text[] then null else lat end,
    case when category = 'home' or categories @> array['home']::text[] then null else lng end
  from public.businesses
  where published = true;
$$;
revoke all on function public.public_business_coordinates() from public;
grant execute on function public.public_business_coordinates() to anon, authenticated;

create or replace function public.public_branch_coordinates()
returns table(branch_id uuid, lat double precision, lng double precision)
language sql stable security definer set search_path = ''
as $$
  select
    bb.id,
    case when b.category = 'home' or b.categories @> array['home']::text[] then null else bb.lat end,
    case when b.category = 'home' or b.categories @> array['home']::text[] then null else bb.lng end
  from public.business_branches bb
  join public.businesses b on b.id = bb.business_id
  where bb.published = true;
$$;
revoke all on function public.public_branch_coordinates() from public;
grant execute on function public.public_branch_coordinates() to anon, authenticated;

-- 2) Close the direct-API gap: anon no longer gets the lat/lng columns directly on either table.
--    authenticated (owner portal, admin) is untouched — same full column access as before.
revoke select on public.businesses from anon;
grant select (
  id, slug, name, name_ar, category, categories, safety, region, city, cities, city_ar, district,
  district_ar, address, address_ar, phone, whatsapp, instagram, website, maps_url,
  cover_url, photos, description, description_ar, products, products_ar, hours, plan,
  offers_booking, discount_code, verified, dedicated_gf, shared_kitchen, precautions_note,
  no_location, published, created_at, updated_at, terms_accepted_at, terms_version,
  business_info_completed
) on public.businesses to anon;

revoke select on public.business_branches from anon;
grant select (
  id, business_id, place_id, name, name_ar, address, address_ar, city, city_ar, district,
  district_ar, region, maps_url, phone, whatsapp, hours, sort_order, permanently_closed,
  published, plan_limited, pickup_enabled, delivery_enabled, delivery_url,
  whatsapp_orders_enabled, created_at, updated_at
) on public.business_branches to anon;

-- 3) businesses.city/city_ar/district/district_ar auto-follow the business's primary branch
--    (lowest sort_order among published branches) whenever a branch is added, edited or removed.
--    Manual typing of these fields is removed from the owner portal and admin UI by this branch's
--    application-code changes; this trigger is what keeps them correct afterwards. It never touches
--    address/lat/lng/region — those are unaffected, exactly as they were.
create or replace function public.sync_business_location_from_branches()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business_id uuid := coalesce(new.business_id, old.business_id);
  v_primary record;
begin
  select bb.city, bb.city_ar, bb.district, bb.district_ar
  into v_primary
  from public.business_branches bb
  where bb.business_id = v_business_id and bb.published = true
  order by bb.sort_order, bb.created_at
  limit 1;

  if found and (v_primary.city is not null or v_primary.city_ar is not null) then
    update public.businesses
    set city = coalesce(v_primary.city, city),
        city_ar = coalesce(v_primary.city_ar, city_ar),
        district = v_primary.district,
        district_ar = v_primary.district_ar
    where id = v_business_id;
  end if;
  return coalesce(new, old);
end
$$;
revoke all on function public.sync_business_location_from_branches() from public;

drop trigger if exists sync_business_location_from_branches on public.business_branches;
create trigger sync_business_location_from_branches
after insert or update or delete on public.business_branches
for each row execute function public.sync_business_location_from_branches();

-- One-time backfill: apply the same sync to every existing business right now, so city/district
-- are correct immediately instead of only after the next branch edit.
update public.businesses b
set city = coalesce(p.city, b.city),
    city_ar = coalesce(p.city_ar, b.city_ar),
    district = p.district,
    district_ar = p.district_ar
from (
  select distinct on (bb.business_id)
    bb.business_id, bb.city, bb.city_ar, bb.district, bb.district_ar
  from public.business_branches bb
  where bb.published = true
  order by bb.business_id, bb.sort_order, bb.created_at
) p
where p.business_id = b.id
  and (p.city is not null or p.city_ar is not null);

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- 1. anon can no longer read lat/lng directly (run as the anon role / via the publishable key):
--   select lat, lng from businesses limit 1;        -- expect a permission error
--   select lat, lng from business_branches limit 1; -- expect a permission error
--
-- 2. The redacted functions work and null out home businesses only:
--   select * from public_business_coordinates()
--   where business_id in (select id from businesses where category = 'home' limit 3);
--   -- expect lat/lng both null for these rows
--   select * from public_business_coordinates()
--   where business_id in (select id from businesses where category <> 'home' and lat is not null limit 3);
--   -- expect the real lat/lng values
--
-- 3. City sync: edit a branch's city for a test business, then check it propagated:
--   select city, city_ar, district, district_ar from businesses where id = '<business id>';
--
-- 4. authenticated (owner/admin) access is unchanged:
--   as an authenticated owner/admin session, lat/lng still select normally from both tables.
