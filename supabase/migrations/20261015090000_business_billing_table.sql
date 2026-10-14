-- Moves billing/invoice fields off `businesses` (where RLS protects ROWS but every column was
-- readable by anyone with the public anon key — confirmed live: a published business's CR number
-- was readable with no login at all) into their own table, which only the owning business's owner
-- and admins can read. Purely additive: the old columns on `businesses` are untouched and still hold
-- the real data; this just adds a new table and copies the data into it. No data is deleted, no
-- column is dropped, no existing read/write path is changed yet (that happens in the app-code
-- deploy, step 2 of this fix, once this table exists here).

create table public.business_billing (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  trade_name text check (trade_name is null or char_length(trade_name) <= 200),
  cr_number text check (cr_number is null or char_length(cr_number) <= 50),
  tax_number text check (tax_number is null or char_length(tax_number) <= 50),
  address text check (address is null or char_length(address) <= 300),
  email text check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  phone text check (phone is null or char_length(phone) <= 40),
  representative_name text check (
    representative_name is null or char_length(representative_name) <= 200
  ),
  representative_title text check (
    representative_title is null or char_length(representative_title) <= 100
  ),
  status text not null default 'not_sent' check (status in ('sent', 'not_sent')),
  updated_at timestamptz not null default now()
);

alter table public.business_billing enable row level security;

-- Only the owning business's owner may read their own billing row. No anon policy exists at all, so
-- anon is denied by default — this is the fix for the exposure.
create policy business_billing_owner_read on public.business_billing for select to authenticated
using (
  exists (
    select 1 from public.business_owners o
    where o.business_id = business_billing.business_id
      and o.email = public.current_owner_email()
  )
);

-- Admins get full direct access (read + write), same as every other admin-managed table in this app.
create policy business_billing_admin_all on public.business_billing for all to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

-- No owner write policy: exactly like every other owner-editable table in this app (menu items,
-- links, branches), the owner's actual writes go through a validated SECURITY DEFINER function
-- (save_business_billing_fields, updated in the next migration), never a direct table write.

revoke all on public.business_billing from public, anon;
grant select on public.business_billing to authenticated;
grant all on public.business_billing to service_role;

-- One-time copy of the existing data. Nothing on `businesses` is touched or removed.
insert into public.business_billing (
  business_id, trade_name, cr_number, tax_number, address, email, phone,
  representative_name, representative_title, status, updated_at
)
select
  id, invoice_trade_name, invoice_cr_number, invoice_tax_number, invoice_address, invoice_email,
  invoice_phone, invoice_representative_name, invoice_representative_title, invoice_status, now()
from public.businesses
where invoice_trade_name is not null
   or invoice_cr_number is not null
   or invoice_tax_number is not null
   or invoice_address is not null
   or invoice_email is not null
   or invoice_phone is not null
   or invoice_representative_name is not null
   or invoice_representative_title is not null
   or invoice_status <> 'not_sent'
on conflict (business_id) do nothing;
