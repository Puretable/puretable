create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 2 and 120),
  email text check (email is null or length(email) <= 255),
  phone text not null check (length(phone) between 8 and 30),
  complaint_type text not null check (length(complaint_type) between 2 and 80),
  order_reference text check (order_reference is null or length(order_reference) <= 100),
  details text not null check (length(details) between 10 and 4000),
  status text not null default 'new'
    check (status in ('new', 'in_review', 'resolved', 'closed')),
  admin_notes text check (admin_notes is null or length(admin_notes) <= 4000),
  initial_response_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists complaints_status_created_idx
on public.complaints (status, created_at desc);

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at before update on public.complaints
for each row execute function public.set_updated_at();

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question_ar text not null check (length(question_ar) between 2 and 300),
  answer_ar text not null check (length(answer_ar) between 2 and 4000),
  question_en text not null default '' check (length(question_en) <= 300),
  answer_en text not null default '' check (length(answer_en) <= 4000),
  visible boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faqs_visible_order_idx
on public.faqs (visible, sort_order, created_at);

drop trigger if exists faqs_set_updated_at on public.faqs;
create trigger faqs_set_updated_at before update on public.faqs
for each row execute function public.set_updated_at();

alter table public.complaints enable row level security;
alter table public.faqs enable row level security;

drop policy if exists complaints_admin_read on public.complaints;
drop policy if exists complaints_admin_update on public.complaints;
drop policy if exists complaints_admin_delete on public.complaints;
drop policy if exists faqs_public_read on public.faqs;
drop policy if exists faqs_anon_read on public.faqs;
drop policy if exists faqs_authenticated_read on public.faqs;
drop policy if exists faqs_admin_insert on public.faqs;
drop policy if exists faqs_admin_update on public.faqs;
drop policy if exists faqs_admin_delete on public.faqs;

create policy complaints_admin_read on public.complaints for select to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

create policy complaints_admin_update on public.complaints for update to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

create policy complaints_admin_delete on public.complaints for delete to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

create policy faqs_anon_read on public.faqs for select to anon
using (visible);

create policy faqs_authenticated_read on public.faqs for select to authenticated
using (visible or (select public.has_role((select auth.uid()), 'admin')));

create policy faqs_admin_insert on public.faqs for insert to authenticated
with check ((select public.has_role((select auth.uid()), 'admin')));

create policy faqs_admin_update on public.faqs for update to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

create policy faqs_admin_delete on public.faqs for delete to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

revoke all on public.complaints, public.faqs from anon, authenticated;
grant select, update, delete on public.complaints to authenticated;
grant select on public.faqs to anon, authenticated;
grant insert, update, delete on public.faqs to authenticated;
grant all on public.complaints, public.faqs to service_role;

-- Site settings are published only through an authenticated server function.
-- Visitors and admins retain the existing restricted read access.
revoke insert, update, delete on public.site_settings from anon, authenticated;
