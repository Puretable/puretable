-- Corrects file 20261015110000: that migration's column-level REVOKE had no effect, because
-- `businesses` also has a broader TABLE-level `grant select on public.businesses to anon,
-- authenticated` from the original baseline migration (20260906223034, line 351) — and in Postgres,
-- a table-level SELECT grant implies access to every column, including ones a narrower column-level
-- REVOKE tries to take back. Verified live: after 20261015110000, invoice_cr_number was still
-- readable by anon. This migration fixes it properly: revoke the table-level grant entirely, then
-- re-grant SELECT on an explicit list of the safe (non-billing) columns only. No data is touched, no
-- column or row is deleted or altered — this is purely a privilege change, same category of change
-- as the two before it.
--
-- Row-level security (businesses_public_read / businesses_authenticated_read) is unaffected and
-- keeps working exactly as before — this only narrows which COLUMNS are visible within whatever rows
-- those policies already allow.
--
-- Write privileges (insert/update/delete) were already safe and are untouched here: the only RLS
-- policy that allows any write at all on `businesses` (businesses_admin_write) requires
-- has_role(..., 'admin'), so no non-admin caller — anon or authenticated — could ever write to this
-- table regardless of the table-level grant.

-- Found while writing this fix: the admin business editor (admin.businesses.$id.tsx /
-- admin.businesses.index.tsx) reads `needs_review`/`review_notes` (internal moderation fields)
-- through the shared per-request `authenticated` client, not a service-role client — so a single
-- grant covering both anon and authenticated can't safely exclude those two columns without also
-- breaking the live admin UI. Billing fields never had this problem (they go through SECURITY
-- DEFINER functions, which bypass grants entirely). Splitting the grant in two solves this without
-- touching any application code: anon gets the narrow public list; authenticated (admins, owners,
-- and any other logged-in user) additionally gets the two moderation columns, which were never
-- billing/PII in the first place — just not something anonymous visitors should see.

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
