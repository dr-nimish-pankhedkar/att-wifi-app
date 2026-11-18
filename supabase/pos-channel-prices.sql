-- Different prices per order channel (e.g. Zomato/Swiggy menu prices). No row = use the dine-in price.
create table if not exists menu_channel_prices (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  variation_id  uuid references menu_variations(id) on delete cascade,
  source        text not null check (source in ('takeaway','zomato','swiggy')),
  price         numeric(10,2) not null check (price >= 0)
);
create unique index if not exists menu_channel_prices_uq
  on menu_channel_prices (menu_item_id, coalesce(variation_id, '00000000-0000-0000-0000-000000000000'::uuid), source);
alter table menu_channel_prices enable row level security;
