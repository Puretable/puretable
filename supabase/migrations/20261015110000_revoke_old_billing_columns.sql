-- Contract step of the billing-exposure fix (step 3 of 3): revokes anon/authenticated SELECT on the
-- old invoice_* columns on `businesses`. This is the fix that actually closes the exposure — files 1
-- and 2 moved the real data and every read/write path onto business_billing, but the old columns
-- were still world-readable the whole time. Nothing is dropped and no data is deleted: the columns
-- and their values stay exactly where they are, for your own later reference, just no longer
-- selectable by anon or by any other logged-in user. The 4 SECURITY DEFINER billing functions and
-- any admin/service-role tooling are completely unaffected — those bypass table grants entirely by
-- design (that's what SECURITY DEFINER means), so this has zero effect on the app.

revoke select (
  invoice_trade_name, invoice_cr_number, invoice_tax_number, invoice_address, invoice_email,
  invoice_phone, invoice_representative_name, invoice_representative_title, invoice_status
) on public.businesses from anon, authenticated;
