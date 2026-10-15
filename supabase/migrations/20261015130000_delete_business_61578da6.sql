-- One-off, PRODUCTION-only cleanup: deletes exactly one business ("الرغيف الخاص / SLB",
-- id 61578da6-ac38-4f49-8618-11e4ea54fe8c) and its dependent rows. Confirmed by the user before
-- writing this file. This is NOT a schema migration (no table/column/grant change) — it's a one-time
-- data deletion, scoped to a single id, run as one transaction so it either fully applies or not at
-- all. No other business is touched.
--
-- Arabic summary / ملخص بالعربي:
-- هذا الملف يحذف منشأة واحدة فقط (المعرّف أعلاه) وكل البيانات المرتبطة بها (الأصناف، الروابط،
-- الفروع، الملاك، بيانات الفوترة، الاشتراكات). قبل الحذف يأخذ نسخة احتياطية كاملة من كل هذه
-- البيانات داخل جداول مؤقتة في نفس قاعدة البيانات، بحيث يمكن التراجع الكامل لاحقًا إن لزم. لا تُحذف
-- أي منشأة أخرى. أحداث التحليلات (analytics_events) المرتبطة بهذه المنشأة لا تُحذف — فقط يُزال
-- ربطها بالمنشأة (business_id يصبح فارغًا)، وهذا هو التصميم الأصلي لقاعدة البيانات حتى تبقى
-- الإحصاءات التاريخية متاحة حتى بعد حذف منشأة.

-- ============================================================================
-- RESTORE SCRIPT — shown first, ready if you ever need to undo this deletion.
-- Do NOT run this block now. It only works AFTER the DELETE block below has run once (it reads
-- from the backup tables that block creates). Keep this file; the backup tables are not touched by
-- anything else and persist until you drop them yourself.
-- ============================================================================
/*
begin;

insert into public.businesses
  select * from public._deleted_biz_61578da6
  on conflict (id) do nothing;

insert into public.business_links
  select * from public._deleted_biz_links_61578da6
  on conflict (id) do nothing;

insert into public.business_branches
  select * from public._deleted_biz_branches_61578da6
  on conflict (id) do nothing;

insert into public.business_menu_items
  select * from public._deleted_biz_menu_items_61578da6
  on conflict (id) do nothing;

insert into public.business_owners
  select * from public._deleted_biz_owners_61578da6
  on conflict (id) do nothing;

insert into public.business_billing
  select * from public._deleted_biz_billing_61578da6
  on conflict (business_id) do nothing;

insert into public.business_subscriptions
  select * from public._deleted_biz_subscriptions_61578da6
  on conflict (id) do nothing;

-- Re-links any analytics_events that were pointed at this business before deletion (they were never
-- deleted, only unlinked — this just restores the business_id on the ones that had it).
update public.analytics_events
   set business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c'
 where id in (select id from public._deleted_biz_analytics_event_ids_61578da6);

commit;

-- Once you've confirmed the restore worked, these backup tables can be dropped:
-- drop table public._deleted_biz_61578da6, public._deleted_biz_links_61578da6,
--   public._deleted_biz_branches_61578da6, public._deleted_biz_menu_items_61578da6,
--   public._deleted_biz_owners_61578da6, public._deleted_biz_billing_61578da6,
--   public._deleted_biz_subscriptions_61578da6, public._deleted_biz_analytics_event_ids_61578da6;
*/

-- ============================================================================
-- BACKUP + DELETE — this is the part you actually run now.
-- ============================================================================
begin;

do $$
begin
  if not exists (
    select 1 from public.businesses where id = '61578da6-ac38-4f49-8618-11e4ea54fe8c'
  ) then
    raise exception 'Business id not found — nothing to delete, transaction aborted.';
  end if;
end $$;

create table public._deleted_biz_61578da6 as
  select * from public.businesses where id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
create table public._deleted_biz_links_61578da6 as
  select * from public.business_links where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
create table public._deleted_biz_branches_61578da6 as
  select * from public.business_branches where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
create table public._deleted_biz_menu_items_61578da6 as
  select * from public.business_menu_items where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
create table public._deleted_biz_owners_61578da6 as
  select * from public.business_owners where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
create table public._deleted_biz_billing_61578da6 as
  select * from public.business_billing where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
create table public._deleted_biz_subscriptions_61578da6 as
  select * from public.business_subscriptions where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
-- Not a full backup of these rows (they are not deleted) — just remembers which ones pointed at
-- this business, so the restore script above can re-link them if needed.
create table public._deleted_biz_analytics_event_ids_61578da6 as
  select id from public.analytics_events where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';

-- The delete itself. Every dependent table's business_id foreign key is ON DELETE CASCADE except
-- analytics_events, which is ON DELETE SET NULL by design (keeps historical stats after a business
-- is removed) — both are handled automatically by Postgres, no separate delete statements needed.
delete from public.businesses where id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';

commit;
