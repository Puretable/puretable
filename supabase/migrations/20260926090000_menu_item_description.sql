-- Optional description for each gluten-free menu item (English + Arabic, like the item name).
alter table public.business_menu_items
  add column description text check (description is null or char_length(description) <= 500),
  add column description_ar text check (description_ar is null or char_length(description_ar) <= 500);
