-- `links_public_read`/`links_authenticated_read` check `show_links` against the business's real
-- stored `plan`, so saved business_links (TikTok, website, booking apps) stay invisible to visitors
-- for any Free-plan business even while the platform-wide "Premium for everyone" override is active
-- (packages_enabled = false/absent) — the same override already applied in owner_portal_overview()
-- and fetchPublicBusinesses()/fetchPublicBusinessBySlug(). This brings the RLS policy in line with
-- those: while packages are disabled, every business is treated as Premium for this check too. The
-- stored `plan` column itself is never touched.
alter policy links_public_read on public.business_links using (
  exists(
    select 1 from public.businesses b
    join public.subscription_plans p
      on p.id = (
        case
          when coalesce((select (s.sections->>'packages_enabled')::boolean from public.site_settings s where s.id = 'default'), false)
          then b.plan
          else 'premium'
        end
      )
    where b.id = business_id and b.published and p.show_links
  )
);
alter policy links_authenticated_read on public.business_links using (
  exists(
    select 1 from public.businesses b
    join public.subscription_plans p
      on p.id = (
        case
          when coalesce((select (s.sections->>'packages_enabled')::boolean from public.site_settings s where s.id = 'default'), false)
          then b.plan
          else 'premium'
        end
      )
    where b.id = business_id and b.published and p.show_links
  )
  or (select public.has_role((select auth.uid()), 'admin'))
);
