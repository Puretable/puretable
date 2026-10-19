-- PRODUCTION RELEASE — file 5 of 5. Run ONLY AFTER the code deploy is confirmed live, not before.
--
-- NOT BACKWARD COMPATIBLE WITH THE OLD CODE: the currently-live production code selects
-- businesses.lat/lng by name, and business_branches.* (select "*"), for anonymous visitors. If this
-- file runs before the new code deploys, BOTH of those queries start failing outright (Postgres
-- refuses a query naming or expanding to a column the role has no grant on) — not just hiding
-- coordinates, but breaking the entire public site (home page, search, every business page) until
-- the new code goes live. The new code only ever requests the narrower column list this file grants
-- (plus the two coordinate functions from file 03, already live), so it works correctly whether this
-- file has run yet or not — there is no urgency to run it immediately, only before you're fully done
-- confirming the release. Run it once you're confident the new code is stable in production.
--
-- This closes a real, pre-existing privacy gap: a direct API call (not just the website's own
-- pages) could already read a home-category business's exact coordinates, since lat/lng were
-- granted as plain columns with no way to make that grant conditional on category. The only correct
-- fix is removing the column grant for anon and serving coordinates exclusively through the
-- redacted functions from file 03.
--
-- Arabic summary / ملخص بالعربي:
-- **لا تُشغّل هذا الملف إلا بعد تأكيد أن الكود الجديد يعمل فعلياً على الإنتاج.** الكود القديم الحالي
-- يقرأ أعمدة الإحداثيات مباشرة للزوار العاديين؛ لو شُغّل هذا الملف قبل الكود الجديد فستتعطل الصفحة
-- الرئيسية والبحث وكل صفحات المنشآت تماماً إلى حين نشر الكود الجديد. هذا الملف يمنع الزوار العاديين
-- من قراءة عمودي الإحداثيات مباشرة نهائياً (يبقى الوصول متاحاً فقط عبر الدالتين المحميتين من الملف
-- رقم 3)، ليغلق ثغرة خصوصية حقيقية كانت موجودة: أي طلب مباشر لقاعدة البيانات كان يقدر يقرأ الإحداثيات
-- الدقيقة لمنشأة مصنّفة "أسرة منتجة". دخول المالك والإدارة (authenticated) لا يتأثر إطلاقاً.
--
-- Target: PRODUCTION ONLY (gmuvmeypkfzbulxgujdu). See the guard below — it can only confirm the
-- INVERSE (this is not the TEST project); visually confirm the project ref in the Supabase dashboard
-- URL yourself before pasting, as the primary safeguard.

-- ============================================================================
-- ROLLBACK
-- ============================================================================
/*
begin;
revoke select on public.businesses from anon;
grant select (
  id, slug, name, name_ar, category, categories, safety, region, city, cities, city_ar, district,
  district_ar, address, address_ar, lat, lng, phone, whatsapp, instagram, website, maps_url,
  cover_url, photos, description, description_ar, products, products_ar, hours, plan,
  offers_booking, discount_code, verified, dedicated_gf, shared_kitchen, precautions_note,
  no_location, published, created_at, updated_at, terms_accepted_at, terms_version,
  business_info_completed
) on public.businesses to anon;

revoke select on public.business_branches from anon;
grant select on public.business_branches to anon;
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
  if not exists (select 1 from pg_proc where proname = 'public_business_coordinates') then
    raise exception 'ABORT: public_business_coordinates() not found — run file 03 first.';
  end if;
end $$;

-- ============================================================================
-- FIX — run this ONLY after the code deploy (step c of the release checklist), never before.
-- ============================================================================
begin;

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

commit;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- 1. anon can no longer read lat/lng directly (run with the publishable/anon key, not the dashboard's
--    own admin connection, which bypasses RLS/grants):
--   select lat, lng from businesses limit 1;        -- expect a permission error
--   select lat, lng from business_branches limit 1; -- expect a permission error
--
-- 2. anon can still read everything else on both tables normally:
--   select id, name, city from businesses limit 1;
--   select id, name, city from business_branches limit 1;
--
-- 3. The public site itself (smoke test): open a real published business page in a private/
--    incognito browser window (never logged in) and confirm it loads with its map and branches.
--
-- 4. authenticated (owner/admin) access is unchanged — log into the owner portal with your own test
--    account and confirm the branch editor's lat/lng fields still load and save normally.
