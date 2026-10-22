-- READ-ONLY verification: confirms YOUR OWN v2 acceptance is correctly recorded on production.
-- Nothing is changed. Paste and run in the production SQL Editor (gmuvmeypkfzbulxgujdu).
-- Masks your email so nothing sensitive is pasted back into chat.

-- 1. Your business's current version/accepted_at, and whether it matches the v2 row's hash:
select
  b.id,
  b.name,
  b.terms_version,
  b.terms_accepted_at,
  (b.terms_version = 'v2') as is_on_v2,
  (
    select a.text_sha256 = v.text_sha256
    from public.agreement_acceptances a
    join public.agreement_versions v on v.terms_version = a.terms_version
    where a.business_id = b.id and a.terms_version = 'v2'
    order by a.accepted_at desc limit 1
  ) as v2_hash_matches_agreement_versions
from public.businesses b
join public.business_owners o on o.business_id = b.id
where o.email = '<paste your own owner login email here>';

-- 2. Your acceptance row (identity confirmed by accepted_by being non-null; email masked):
select
  left(o.email, 2) || '***@' || split_part(o.email, '@', 2) as email_masked,
  a.terms_version,
  a.accepted_at,
  (a.accepted_by is not null) as has_real_user_id,
  (a.text_sha256 = v.text_sha256) as hash_matches_v2
from public.agreement_acceptances a
join public.businesses b on b.id = a.business_id
join public.business_owners o on o.business_id = b.id
join public.agreement_versions v on v.terms_version = 'v2'
where o.email = '<paste your own owner login email here>'
  and a.terms_version = 'v2'
order by a.accepted_at desc;

-- 3. The confirmation email's delivery status (email masked, no content/token exposed):
select
  left(recipient, 2) || '***@' || split_part(recipient, '@', 2) as recipient_masked,
  notification_type,
  status,
  created_at
from public.email_deliveries
where notification_type = 'agreement_accepted'
  and recipient = '<paste your own owner login email here>'
order by created_at desc
limit 3;
