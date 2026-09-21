-- The public "Join Us" form was retired in favour of the Business Owner Portal.
-- New partner leads were only ever written by that form's server function (service role),
-- but the baseline schema also let anonymous and signed-in visitors insert straight through the
-- public API. Nothing uses that path any more, so close it.
--
-- Deliberately kept: existing rows, read/update/delete for admins (the admin leads inbox) and the
-- admin policy. Only *creating* leads through the public API is removed.
drop policy if exists partner_public_insert on public.partner_leads;
revoke insert on public.partner_leads from anon, authenticated;
