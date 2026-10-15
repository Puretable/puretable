-- One-off, PRODUCTION-only cleanup: deletes exactly one business ("الرغيف الخاص / SLB",
-- id 61578da6-ac38-4f49-8618-11e4ea54fe8c) and its dependent rows. Confirmed by the user before
-- writing this file. This is NOT a schema migration (no table/column/grant change) — it's a one-time
-- data deletion, scoped to a single id, run as one transaction so it either fully applies or not at
-- all. No other business is touched.
--
-- REVISION 2 — the first run of this file failed and rolled back cleanly (nothing was deleted,
-- including the backup tables — a failed transaction undoes everything in it, so there was nothing
-- to clean up before re-running). Error was:
--   23503 foreign key violation on analytics_events, raised from the trigger
--   favorites_log_analytics (after delete on public.favorites).
-- Root cause: favorites.business_id is ON DELETE CASCADE, so deleting the business cascades into
-- deleting its favorites rows; that delete fires favorites_log_analytics, which tries to insert a
-- 'favorite_remove' analytics_events row referencing business_id — but by then, mid-cascade, the
-- business row is already gone, so that insert violates analytics_events' own foreign key.
-- This affects EVERY business that has at least one favorite, not just this one — see the separate
-- migration 20261015140000_admin_delete_business_function.sql, which fixes this for the admin UI's
-- delete button going forward. The trigger itself is untouched and still fires normally — this file
-- just deletes this business's favorites explicitly, one step earlier, while the business row still
-- exists, so the trigger's insert is always valid. No other trigger in this schema has the same
-- after-delete-insert-referencing-business_id shape (checked every trigger in every migration file).
--
-- Arabic summary / ملخص بالعربي:
-- هذا الملف يحذف منشأة واحدة فقط (المعرّف أعلاه) وكل البيانات المرتبطة بها (الأصناف، الروابط،
-- الفروع، الملاك، بيانات الفوترة، الاشتراكات، المفضّلات). قبل الحذف يأخذ نسخة احتياطية كاملة من كل
-- هذه البيانات داخل جداول مؤقتة في نفس قاعدة البيانات، بحيث يمكن التراجع الكامل لاحقًا إن لزم. لا
-- تُحذف أي منشأة أخرى. المحاولة الأولى فشلت بسبب خطأ في قاعدة البيانات (trigger يحاول تسجيل حدث
-- إحصائي لمنشأة حُذفت للتو) — تم إصلاحه هنا بحذف المفضّلات أولاً، قبل حذف المنشأة، بنفس الصلاحيات،
-- دون تعطيل أي trigger. أحداث التحليلات (analytics_events) المرتبطة بهذه المنشأة لا تُحذف — فقط
-- يُزال ربطها بالمنشأة، وهذا هو التصميم الأصلي لقاعدة البيانات.

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

insert into public.favorites
  select * from public._deleted_biz_favorites_61578da6
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
--   public._deleted_biz_subscriptions_61578da6, public._deleted_biz_favorites_61578da6,
--   public._deleted_biz_analytics_event_ids_61578da6;
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

-- Every backup table below gets RLS enabled with zero policies right after creation — a plain
-- CREATE TABLE ... AS SELECT does NOT inherit RLS from the source table, and these tables hold real
-- business data (billing fields included), so they must not be queryable by anyone via the API.
-- "enable row level security" with no policy means deny-by-default for every role except the table
-- owner (never exposed through PostgREST/anon/authenticated). The explicit revoke is defense in
-- depth in case of any broader default-privilege grant.

create table public._deleted_biz_61578da6 as
  select * from public.businesses where id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_61578da6 enable row level security;
revoke all on public._deleted_biz_61578da6 from public, anon, authenticated;

create table public._deleted_biz_links_61578da6 as
  select * from public.business_links where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_links_61578da6 enable row level security;
revoke all on public._deleted_biz_links_61578da6 from public, anon, authenticated;

create table public._deleted_biz_branches_61578da6 as
  select * from public.business_branches where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_branches_61578da6 enable row level security;
revoke all on public._deleted_biz_branches_61578da6 from public, anon, authenticated;

create table public._deleted_biz_menu_items_61578da6 as
  select * from public.business_menu_items where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_menu_items_61578da6 enable row level security;
revoke all on public._deleted_biz_menu_items_61578da6 from public, anon, authenticated;

create table public._deleted_biz_owners_61578da6 as
  select * from public.business_owners where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_owners_61578da6 enable row level security;
revoke all on public._deleted_biz_owners_61578da6 from public, anon, authenticated;

create table public._deleted_biz_billing_61578da6 as
  select * from public.business_billing where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_billing_61578da6 enable row level security;
revoke all on public._deleted_biz_billing_61578da6 from public, anon, authenticated;

create table public._deleted_biz_subscriptions_61578da6 as
  select * from public.business_subscriptions where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_subscriptions_61578da6 enable row level security;
revoke all on public._deleted_biz_subscriptions_61578da6 from public, anon, authenticated;

create table public._deleted_biz_favorites_61578da6 as
  select * from public.favorites where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_favorites_61578da6 enable row level security;
revoke all on public._deleted_biz_favorites_61578da6 from public, anon, authenticated;

-- Not a full backup of these rows (they are not deleted) — just remembers which ones pointed at
-- this business, so the restore script above can re-link them if needed. No billing/PII data in
-- this one (just ids), but RLS is enabled anyway for consistency.
create table public._deleted_biz_analytics_event_ids_61578da6 as
  select id from public.analytics_events where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';
alter table public._deleted_biz_analytics_event_ids_61578da6 enable row level security;
revoke all on public._deleted_biz_analytics_event_ids_61578da6 from public, anon, authenticated;

-- Delete favorites FIRST, while the business row still exists, so favorites_log_analytics' insert
-- into analytics_events (business_id = the one being removed) is still valid when it fires. The
-- trigger is not touched or disabled — this just makes sure it never runs after the business is gone.
delete from public.favorites where business_id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';

-- The business itself. Every remaining dependent table's business_id foreign key is ON DELETE
-- CASCADE except analytics_events, which is ON DELETE SET NULL by design (keeps historical stats
-- after a business is removed) — both are handled automatically by Postgres.
delete from public.businesses where id = '61578da6-ac38-4f49-8618-11e4ea54fe8c';

commit;
