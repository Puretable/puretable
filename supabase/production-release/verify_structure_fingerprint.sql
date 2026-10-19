-- Read-only structure fingerprint for this release's objects. Run this on the PRODUCTION SQL
-- Editor (gmuvmeypkfzbulxgujdu) and send Claude the result to compare against what the 5 production
-- files were written to produce. Nothing here writes or changes anything.
--
-- What to expect in the output, row by row:
--  - 'function': exactly 9 rows (accept_partnership_agreement, admin_list_business_billing,
--    owner_sync_pickup_delivery_tags, sync_business_location_from_branches,
--    public_business_coordinates, public_branch_coordinates,
--    enforce_shared_kitchen_note_admin_only, block_agreement_mutation,
--    get_agreement_version_text). The exact def_hash values don't need to match anything by eye —
--    send them and Claude will confirm each one's expected body.
--  - 'trigger': at least 'enforce_shared_kitchen_note_admin_only' on businesses and
--    'sync_business_location_from_branches' on business_branches, plus
--    'block_agreement_mutation' triggers on agreement_versions/agreement_acceptances.
--  - 'policy': RLS policies on agreement_versions/agreement_acceptances (owner/admin read; no
--    write policy for anyone — writes only via accept_partnership_agreement).
--  - 'index': business_links_business_level_unique and agreement_acceptances_business_idx.
--  - 'anon_grant': since files 01-05 have all run, this list must NOT include any row where
--    column_name is 'lat' or 'lng' for either table — if it does, file 05 did not take effect.
--  - 'column': exactly 4 rows (pickup_enabled, delivery_enabled, delivery_url,
--    whatsapp_orders_enabled on business_branches).

-- 1) Functions touched by this release: signature + a hash of the body, so a body difference shows
--    up even if the signature matches.
select
  'function' as kind,
  p.proname as name,
  pg_get_function_identity_arguments(p.oid) as args,
  md5(pg_get_functiondef(p.oid)) as def_hash
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'accept_partnership_agreement', 'admin_list_business_billing',
    'owner_sync_pickup_delivery_tags', 'sync_business_location_from_branches',
    'public_business_coordinates', 'public_branch_coordinates',
    'enforce_shared_kitchen_note_admin_only', 'block_agreement_mutation',
    'get_agreement_version_text'
  )

union all

-- 2) Triggers on businesses / business_branches / agreement_* relevant to this release.
select
  'trigger', t.tgname,
  c.relname,
  md5(pg_get_triggerdef(t.oid))
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and not t.tgisinternal
  and c.relname in ('businesses', 'business_branches', 'agreement_versions', 'agreement_acceptances')

union all

-- 3) Row-level security policies on the same tables.
select
  'policy', pol.polname,
  c.relname,
  md5(pg_get_expr(pol.polqual, pol.polrelid) || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('businesses', 'business_branches', 'agreement_versions', 'agreement_acceptances')

union all

-- 4) Indexes added/relevant to this release.
select
  'index', indexname, tablename,
  md5(indexdef)
from pg_indexes
where schemaname = 'public'
  and (indexname in ('business_links_business_level_unique', 'agreement_acceptances_business_idx')
       or tablename in ('agreement_versions', 'agreement_acceptances'))

union all

-- 5) Column-level SELECT grants to anon on businesses / business_branches — the exact thing file 05
--    changes. Compare this list carefully: production should show the NARROW list (no lat/lng) only
--    once file 05 has run; before that it will differ from TEST on purpose.
select
  'anon_grant', table_name, column_name, privilege_type
from information_schema.column_privileges
where grantee = 'anon' and table_schema = 'public'
  and table_name in ('businesses', 'business_branches')
  and privilege_type = 'SELECT'

union all

-- 6) Columns on business_branches (confirms the new pickup/delivery/whatsapp/delivery_url columns).
select
  'column', table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'business_branches'
  and column_name in ('pickup_enabled', 'delivery_enabled', 'delivery_url', 'whatsapp_orders_enabled')

order by 1, 2, 3;
