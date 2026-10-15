-- Re-applies 8 function definitions and the two business_billing policies, verbatim from the
-- production definitions pasted by the user on 2026-10-16, to TEST only. Every function/policy here
-- was confirmed (by comparing production's pasted definition to the latest migration file that
-- creates it) to already match the repository exactly — no drift was found between production and
-- the repo for any of these 10 items. This file is a confirmatory, idempotent re-apply: if TEST
-- already matches (expected, since none of these were touched by any migration this session), every
-- statement below is a safe no-op. No row data is touched.
--
-- Arabic summary / ملخص بالعربي:
-- يعيد هذا الملف تطبيق 8 دوال وسياستين من جدول business_billing على TEST فقط، بنفس النص الذي أرسلته
-- من production بالضبط. راجعت كل واحدة منها مقابل آخر ملف migration في المستودع ولم أجد أي اختلاف
-- حقيقي — فهذا الملف تأكيدي: إن كانت TEST مطابقة أصلاً (وهذا المتوقع)، فلن يُغيّر شيئاً فعلياً. لا
-- بيانات صفوف تُلمس.
--
-- Target: TEST ONLY (sdfexmyeldrsnvwsdzbh). Refuses to run anywhere else (same guard as the
-- previous sync file; uses the same __is_test_env marker in public.app_config — already present
-- on TEST from the last sync, no need to re-create it).

-- ============================================================================
-- ROLLBACK — not meaningful here (every statement below is a confirmatory re-apply of what
-- production/the repo already define — there is nothing to "undo" to a different prior state).
-- Kept for consistency with the standing workflow: re-running this file again is itself the
-- rollback, since it is idempotent.
-- ============================================================================
/*
-- (intentionally empty — see note above)
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
-- SYNC — run this now, on TEST only.
-- ============================================================================
begin;

create or replace function public.business_report(_business_id uuid, _since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  with ev as (
    select *
    from public.analytics_events
    where not is_admin
      and business_id = _business_id
      and (_since is null or created_at >= _since)
  ), daily as (
    select
      (created_at at time zone 'Asia/Riyadh')::date d,
      count(*) filter (where event_type = 'page_view') views,
      count(*) filter (where event_type like 'click%') clicks
    from ev
    group by 1
  )
  select jsonb_build_object(
    'impressions', count(*) filter (where event_type = 'impression'),
    'views', count(*) filter (where event_type = 'page_view'),
    'maps', count(*) filter (where event_type = 'click_maps'),
    'delivery', count(*) filter (where event_type = 'click_delivery'),
    'booking', count(*) filter (where event_type = 'click_booking'),
    'whatsapp', count(*) filter (where event_type = 'click_whatsapp'),
    'website', count(*) filter (where event_type = 'click_website'),
    'phone', count(*) filter (where event_type = 'click_phone'),
    'social', count(*) filter (where event_type = 'click_social'),
    'contactClicks', count(*) filter (
      where event_type in ('click_whatsapp', 'click_website', 'click_phone')
    ),
    'favorites', count(*) filter (where event_type = 'favorite_add'),
    'timeseries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'views', views, 'clicks', clicks)
          order by d
        ), '[]'
      )
      from daily
    )
  ) into result
  from ev;
  return result;
end
$$;
revoke all on function public.business_report(uuid, timestamptz) from public, anon;
grant execute on function public.business_report(uuid, timestamptz) to authenticated;

create or replace function public.admin_dashboard(_since timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden'; end if;
  with ev as (
    select * from public.analytics_events where not is_admin
  ), rng as (
    select * from ev where _since is null or created_at >= _since
  ), vis as (
    select coalesce(visitor_id, session_id) v, session_id, created_at
    from ev
    where coalesce(visitor_id, session_id, '') <> ''
  ), perbiz as (
    select
      business_id,
      count(*) filter (where event_type = 'page_view') views,
      count(*) filter (where event_type = 'impression') impressions,
      count(*) filter (where event_type = 'click_maps') maps,
      count(*) filter (where event_type = 'click_delivery') delivery,
      count(*) filter (where event_type = 'click_booking') booking,
      count(*) filter (where event_type = 'click_whatsapp') whatsapp,
      count(*) filter (where event_type = 'click_website') website,
      count(*) filter (where event_type = 'click_phone') phone,
      count(*) filter (where event_type = 'click_social') social,
      count(*) filter (where event_type = 'favorite_add') favorites,
      count(*) filter (
        where event_type like 'click%'
          and event_type not in (
            'click_maps', 'click_delivery', 'click_booking', 'click_whatsapp',
            'click_website', 'click_phone', 'click_social'
          )
      ) other
    from rng
    where business_id is not null
    group by business_id
  ), daily as (
    select
      (created_at at time zone 'Asia/Riyadh')::date d,
      count(*) filter (where event_type = 'page_view') views,
      count(*) filter (where event_type like 'click%') clicks
    from rng
    group by 1
  )
  select jsonb_build_object(
    'visitors', jsonb_build_object(
      'online', (
        select count(distinct session_id) from ev
        where session_id is not null and created_at >= now() - interval '5 minutes'
      ),
      'today', (
        select count(distinct v) from vis
        where created_at >= (
          date_trunc('day', now() at time zone 'Asia/Riyadh') at time zone 'Asia/Riyadh'
        )
      ),
      'week', (select count(distinct v) from vis where created_at >= now() - interval '7 days'),
      'month', (select count(distinct v) from vis where created_at >= now() - interval '30 days'),
      'quarter', (select count(distinct v) from vis where created_at >= now() - interval '90 days'),
      'allTime', (select count(distinct v) from vis),
      'inRange', (select count(distinct visitor_id) from rng where visitor_id is not null)
    ),
    'totals', jsonb_build_object(
      'pageViews', (select count(*) from rng where event_type = 'page_view'),
      'businessPageViews', (
        select count(*) from rng where event_type = 'page_view' and business_id is not null
      ),
      'clicks', (select count(*) from rng where event_type like 'click%'),
      'uniqueVisitors', (select count(distinct visitor_id) from rng where visitor_id is not null),
      'sessions', (select count(distinct session_id) from rng where session_id is not null)
    ),
    'businesses', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.views desc, x.clicks desc, x.name), '[]')
      from (
        select
          b.id, b.name, b.slug, b.city, b.plan,
          coalesce(p.views, 0) views,
          coalesce(p.impressions, 0) impressions,
          coalesce(p.maps, 0) maps,
          coalesce(p.delivery, 0) delivery,
          coalesce(p.booking, 0) booking,
          coalesce(p.whatsapp, 0) whatsapp,
          coalesce(p.website, 0) website,
          coalesce(p.phone, 0) phone,
          coalesce(p.social, 0) social,
          coalesce(p.favorites, 0) favorites,
          coalesce(p.other, 0) other,
          coalesce(p.whatsapp, 0) + coalesce(p.website, 0) + coalesce(p.phone, 0) "contactClicks",
          coalesce(p.maps, 0) + coalesce(p.delivery, 0) + coalesce(p.booking, 0) +
            coalesce(p.whatsapp, 0) + coalesce(p.website, 0) + coalesce(p.phone, 0) +
            coalesce(p.social, 0) + coalesce(p.other, 0) clicks
        from public.businesses b
        left join perbiz p on p.business_id = b.id
      ) x
    ),
    'deliveryLinks', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select e.link_id id, count(*) count, l.platform, l.product_name product,
          l.url, b.name business
        from rng e
        join public.business_links l on l.id = e.link_id
        join public.businesses b on b.id = l.business_id
        where e.link_id is not null and e.event_type like 'click%'
        group by e.link_id, l.platform, l.product_name, l.url, b.name
      ) x
    ),
    'filters', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select label, count(*) count from rng
        where event_type in ('filter', 'filter_click') and label is not null
        group by label limit 25
      ) x
    ),
    'mainFilters', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select label, count(*) count from rng
        where event_type in ('filter', 'filter_click') and label is not null
          and platform is distinct from 'secondary'
        group by label limit 25
      ) x
    ),
    'secondaryFilters', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select label, count(*) count from rng
        where event_type in ('filter', 'filter_click') and label is not null and platform = 'secondary'
        group by label limit 25
      ) x
    ),
    'searches', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select lower(btrim(query)) term, count(*) count from rng
        where event_type = 'search' and btrim(coalesce(query, '')) <> ''
        group by 1 limit 25
      ) x
    ),
    'platforms', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select platform, count(*) count from rng
        where event_type like 'click%' and platform is not null
        group by platform limit 25
      ) x
    ),
    'cities', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.count desc), '[]')
      from (
        select city, count(*) count from rng
        where event_type = 'page_view' and city is not null
        group by city limit 12
      ) x
    ),
    'timeseries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'), 'views', views, 'clicks', clicks)
          order by d
        ), '[]'
      )
      from daily
    )
  ) into result;
  return result;
end
$$;
revoke all on function public.admin_dashboard(timestamptz) from public, anon;
grant execute on function public.admin_dashboard(timestamptz) to authenticated;

create or replace function public.claim_admin_role() returns boolean
language sql security invoker set search_path = '' as $$
  select public.has_role(auth.uid(), 'admin');
$$;
revoke all on function public.claim_admin_role() from public, anon, authenticated;

create or replace function public.enforce_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if not new.published or new.permanently_closed then
    return new;
  end if;

  new.plan_limited := false;

  select b.plan
    into v_plan
  from public.businesses b
  where b.id = new.business_id
  for update;

  if not found then
    raise exception 'Business does not exist' using errcode = 'foreign_key_violation';
  end if;

  select branch_limit into strict v_limit from public.subscription_plans where id = v_plan;
  if v_limit is null then
    return new;
  end if;

  select count(*)
    into v_count
  from public.business_branches br
  where br.business_id = new.business_id
    and br.published
    and not br.permanently_closed
    and br.id <> new.id;

  if v_count >= v_limit then
    raise exception 'Branch limit reached for % plan (maximum %)', v_plan, v_limit
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;
revoke all on function public.enforce_branch_limit() from public, anon, authenticated;

create or replace function public.apply_plan_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_published integer;
  v_slots integer;
begin
  select branch_limit into strict v_limit from public.subscription_plans where id = new.plan;

  if v_limit is null then
    update public.business_branches br
       set published = true,
           plan_limited = false
     where br.business_id = new.id
       and br.plan_limited
       and not br.permanently_closed;
    return new;
  end if;

  with keep as (
    select br.id
    from public.business_branches br
    where br.business_id = new.id
      and br.published
      and not br.permanently_closed
    order by br.sort_order, br.created_at, br.id
    limit v_limit
  )
  update public.business_branches br
     set published = false,
         plan_limited = true
   where br.business_id = new.id
     and br.published
     and br.id not in (select id from keep);

  select count(*)
    into v_published
  from public.business_branches br
  where br.business_id = new.id
    and br.published
    and not br.permanently_closed;

  v_slots := greatest(v_limit - v_published, 0);
  if v_slots > 0 then
    with restore as (
      select br.id
      from public.business_branches br
      where br.business_id = new.id
        and br.plan_limited
        and not br.permanently_closed
      order by br.sort_order, br.created_at, br.id
      limit v_slots
    )
    update public.business_branches br
       set published = true,
           plan_limited = false
     where br.id in (select id from restore);
  end if;

  return new;
end
$$;
revoke all on function public.apply_plan_branch_limit() from public, anon, authenticated;

create or replace function public.propagate_subscription_plan() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.branch_limit is distinct from old.branch_limit then
    perform id from public.businesses where plan=new.id order by id for update;
    update public.businesses set plan=plan where plan=new.id;
  end if;
  if auth.uid() is not null then
    insert into public.admin_audit_log(user_id,user_email,action,entity,entity_id,entity_label,details)
    values(auth.uid(),auth.jwt()->>'email','update_plan_definition','subscription_plan',new.id,new.id,
      jsonb_build_object('before',to_jsonb(old),'after',to_jsonb(new)));
  end if;
  return new;
end $$;
revoke all on function public.propagate_subscription_plan() from public,anon,authenticated;

create or replace function public.version_subscription_plan() returns trigger
language plpgsql set search_path='' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.version_subscription_plan() from public,anon,authenticated;

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

-- business_billing policies — re-created idempotently from the pasted production definitions.
drop policy if exists business_billing_admin_all on public.business_billing;
create policy business_billing_admin_all on public.business_billing for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists business_billing_owner_read on public.business_billing;
create policy business_billing_owner_read on public.business_billing for select to authenticated
using (
  exists (
    select 1 from public.business_owners o
    where o.business_id = business_billing.business_id
      and o.email = public.current_owner_email()
  )
);

commit;

-- ============================================================================
-- VERIFY
-- ============================================================================
-- select prosrc from pg_proc where proname in
--   ('admin_dashboard','apply_plan_branch_limit','business_report','claim_admin_role',
--    'enforce_branch_limit','log_favorite_analytics','propagate_subscription_plan',
--    'version_subscription_plan');
-- select polname, qual, with_check from pg_policy
--   where polrelid = 'public.business_billing'::regclass;
-- select has_function_privilege('authenticated', 'public.claim_admin_role()', 'execute'); -- false (revoked from everyone)
