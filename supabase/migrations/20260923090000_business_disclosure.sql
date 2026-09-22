-- Business Disclosure (الإفصاح التجاري): a single admin-editable record, fully invisible to the
-- public (and to signed-in non-admins) until `active = true`. Deliberately its own table, NOT part
-- of `site_settings.content` — that column is fetched unfiltered and dehydrated into every page's
-- server-rendered payload (see __root.tsx), so anything stored there is effectively public the
-- moment it is saved, before any "activate" toggle. Row Level Security is the actual privacy
-- boundary here: the public read policy filters out the entire row (not just some columns) while
-- inactive, so a draft can never appear in page source, an API response, or any page's SSR state.

create table public.business_disclosure (
  id text primary key default 'default' check (id = 'default'),
  active boolean not null default false,
  business_name text check (business_name is null or char_length(business_name) <= 200),
  owner_name text check (owner_name is null or char_length(owner_name) <= 200),
  cr_number text check (cr_number is null or char_length(cr_number) <= 50),
  address text check (address is null or char_length(address) <= 300),
  email text check (email is null or char_length(email) <= 255),
  phone text check (phone is null or char_length(phone) <= 40),
  updated_at timestamptz not null default now(),
  -- Defense in depth: the server function already refuses to activate without these, but the
  -- database itself must never end up in an active-and-empty state either.
  check (
    not active
    or (business_name is not null and btrim(business_name) <> ''
        and cr_number is not null and btrim(cr_number) <> '')
  )
);
insert into public.business_disclosure (id) values ('default');

create trigger business_disclosure_set_updated_at before update on public.business_disclosure
for each row execute function public.set_updated_at();

alter table public.business_disclosure enable row level security;
revoke all on public.business_disclosure from anon, authenticated;
grant select on public.business_disclosure to anon, authenticated;
grant update on public.business_disclosure to authenticated;
grant all on public.business_disclosure to service_role;

-- The confidentiality boundary: while inactive, this policy excludes the row entirely for anyone
-- who isn't an admin — not just from a UI, from the Data API itself.
create policy business_disclosure_public_read on public.business_disclosure for select to anon, authenticated
using (active);

-- Admins can always read the current draft (even inactive) so they have something to edit.
create policy business_disclosure_admin_read on public.business_disclosure for select to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

create policy business_disclosure_admin_write on public.business_disclosure for update to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));
