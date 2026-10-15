-- Fixes a real, reproducible bug: deleting ANY business that has at least one row in `favorites`
-- fails with a foreign-key violation (23503). Root cause: favorites.business_id is ON DELETE CASCADE,
-- and the after-delete trigger favorites_log_analytics (on public.favorites) inserts a
-- 'favorite_remove' analytics_events row referencing business_id — but by the time the CASCADE
-- fires the favorites delete, the business row is already gone, so that insert violates
-- analytics_events' own foreign key to businesses. Confirmed live on production with a real delete
-- attempt. No other trigger in this schema has the same after-delete-insert-referencing-business_id
-- shape (checked every trigger in every migration file), so this is the only place this fix is
-- needed.
--
-- Fix: delete this business's favorites (every user's, not just the caller's — RLS normally
-- restricts a session to deleting only its own favorites) BEFORE deleting the business, inside one
-- function call, which runs as a single transaction. The favorites_log_analytics trigger still
-- fires and still logs 'favorite_remove' events, correctly, while the business row still exists —
-- nothing about that trigger changes or is disabled.
--
-- Arabic summary / ملخص بالعربي:
-- هذا الملف يصلح خللاً حقيقياً: حذف أي منشأة لديها مفضّلات (favorites) من أي مستخدم يفشل بسبب خطأ في
-- قاعدة البيانات. الحل: دالة جديدة للإدارة فقط تحذف مفضّلات المنشأة أولاً ثم تحذف المنشأة نفسها،
-- كخطوة واحدة متكاملة. لا يُعطَّل أي triggers ولا يُحذف أي شيء آخر غير هذه المنشأة ومفضّلاتها.

create or replace function public.admin_delete_business(_business_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.favorites where business_id = _business_id;
  delete from public.businesses where id = _business_id;
  if not found then raise exception 'Business not found' using errcode = 'no_data_found'; end if;
end
$$;
revoke all on function public.admin_delete_business(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_business(uuid) to authenticated;
