-- PRODUCTION RELEASE — file 3 of 5. Run BEFORE the code deploy. Purely additive: two new read
-- functions nothing currently calls, a new trigger on business_branches, and a one-time UPDATE that
-- only ever copies a branch's own city/district onto its parent business (never touches
-- address/lat/lng/region, never deletes anything). The new code REQUIRES
-- public_business_coordinates()/public_branch_coordinates() to exist the moment it deploys (it
-- calls them unconditionally for every public page) — this file must run first for that reason.
--
-- IMPORTANT: this file does NOT touch anon's column grants on businesses/business_branches — that
-- part (file 05) is deliberately separate and must run AFTER the code deploy, because the
-- currently-live code still selects businesses.lat/lng and business_branches.* by name for anon;
-- narrowing those grants before the new code is live would break the public site. See the final
-- report for why.
--
-- Arabic summary / ملخص بالعربي:
-- يضيف هذا الملف دالتين جديدتين (لا يستخدمهما أي كود حالياً) تُرجعان الإحداثيات، مع إخفائها تلقائياً
-- لو كانت المنشأة من تصنيف "أسرة منتجة" — وتريغر جديد على جدول الفروع يحدّث مدينة/حي المنشأة تلقائياً
-- من فرعها الأساسي كلما أُضيف فرع أو عُدّل أو حُذف، مع تعبئة تاريخية فورية لكل المنشآت الحالية. لا شيء
-- يُحذف، ولا يُغيَّر العنوان أو الإحداثيات أو المنطقة على مستوى المنشأة. **يجب تشغيل هذا الملف قبل
-- نشر الكود الجديد** — الكود الجديد يستدعي الدالتين الجديدتين في كل صفحة عامة فوراً عند نشره.
--
-- Target: PRODUCTION ONLY (gmuvmeypkfzbulxgujdu). See the guard below — it can only confirm the
-- INVERSE (this is not the TEST project); visually confirm the project ref in the Supabase dashboard
-- URL yourself before pasting, as the primary safeguard.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
begin;
drop trigger if exists sync_business_location_from_branches on public.business_branches;
drop function if exists public.sync_business_location_from_branches();
drop function if exists public.public_business_coordinates();
drop function if exists public.public_branch_coordinates();
commit;
*/
-- Note: the one-time city/district backfill is not reversible (there is no record of each
-- business's PRE-backfill city/district) — this matches how every other backfill in this project's
-- migrations works. If a specific business's city/district needs to be restored to a prior value,
-- do it by hand for that business only.

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
-- FIX — additive only, safe before the code deploy. (Grant narrowing is file 05, after the code.)
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
-- 1. Both functions exist and are callable by anon/authenticated:
--   select has_function_privilege('anon', 'public.public_business_coordinates()', 'execute'); -- true
--   select has_function_privilege('anon', 'public.public_branch_coordinates()', 'execute'); -- true
--
-- 2. Redaction works (pick a real home-category business id from your own data):
--   select * from public_business_coordinates() where business_id = '<a home-category business id>';
--   -- expect lat/lng both null
--
-- 3. City sync trigger exists:
--   select tgname from pg_trigger where tgrelid = 'public.business_branches'::regclass
--     and tgname = 'sync_business_location_from_branches';
--
-- 4. Spot-check the backfill on a few businesses you know the branch cities for:
--   select b.id, b.city, b.city_ar from public.businesses b limit 5;
