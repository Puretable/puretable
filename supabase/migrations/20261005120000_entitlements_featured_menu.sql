-- Two owner-facing entitlement flags ("featured" and "menu") were still read client-side straight
-- from the business's raw `plan` column (PLAN_FEATURES[b.plan].featured, overview.plan === "free")
-- instead of from the already-overridden `entitlements` object — so while packages are
-- platform-disabled, a nominally-Free business's Premium override was silently incomplete: the menu
-- tab stayed client-side blocked and the "Featured placement" feature showed as unavailable, even
-- though the server itself already allowed both. This adds both as real entitlement fields, computed
-- from the same already-overridden plan join used for every other entitlement, so the client has an
-- authoritative signal instead of reading the real `plan` itself.
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
