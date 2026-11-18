-- POS (PetPooja replacement): menu, tables, orders, KOT lines, recipes.
-- Additive only. RLS on with NO public policies: all access goes through
-- server API routes using the service role, never the anon key.

create table if not exists pos_tables (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,               -- e.g. "G1", "Baithak 2", "Takeaway"
  area        text not null default '',    -- e.g. "Ground floor", "First floor", "Baithak"
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists menu_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid references menu_categories(id) on delete set null,
  name         text not null,
  price        numeric(10,2) not null check (price >= 0),
  short_code   text,                       -- quick search on captain app
  sort_order   int  not null default 0,
  active       boolean not null default true,   -- false = hidden from menu
  in_stock     boolean not null default true,   -- false = temporarily unavailable
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (category_id, name)
);

-- Ingredients used per 1 unit of a menu item, in the inventory item's own unit.
create table if not exists menu_recipes (
  menu_item_id      uuid not null references menu_items(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  qty               numeric not null check (qty > 0),
  primary key (menu_item_id, inventory_item_id)
);

create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  bill_no         bigint generated always as identity unique,
  client_id       uuid unique,             -- set by device; makes offline sync idempotent
  source          text not null default 'dine_in'
                  check (source in ('dine_in','takeaway','zomato','swiggy')),
  table_id        uuid references pos_tables(id) on delete set null,
  status          text not null default 'open'
                  check (status in ('open','settled','cancelled')),
  customer_name   text,
  customer_phone  text,
  subtotal        numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0 check (discount >= 0),
  total           numeric(10,2) not null default 0,
  payment_mode    text check (payment_mode in ('cash','upi','split','online')),
  cash_amount     numeric(10,2) not null default 0,
  upi_amount      numeric(10,2) not null default 0,
  captain_id      uuid references profiles(id) on delete set null,
  notes           text,
  cancel_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  settled_at      timestamptz
);

create table if not exists order_items (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid unique,
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid references menu_items(id) on delete set null,
  name          text not null,             -- snapshot at time of order
  price         numeric(10,2) not null,    -- snapshot at time of order
  qty           int not null check (qty > 0),
  note          text,                      -- "less sugar", "no onion"
  kot_round     int not null default 1,    -- 1st send, 2nd add-on, ...
  kot_status    text not null default 'new'
                check (kot_status in ('new','preparing','ready','served','cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists orders_created_at_idx     on orders (created_at desc);
create index if not exists orders_status_idx         on orders (status);
create index if not exists order_items_order_idx     on order_items (order_id);
create index if not exists order_items_kot_open_idx  on order_items (kot_status)
  where kot_status in ('new','preparing','ready');
create index if not exists menu_items_category_idx   on menu_items (category_id);

create or replace function pos_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists menu_items_touch  on menu_items;
drop trigger if exists orders_touch      on orders;
drop trigger if exists order_items_touch on order_items;
create trigger menu_items_touch  before update on menu_items  for each row execute function pos_touch_updated_at();
create trigger orders_touch      before update on orders      for each row execute function pos_touch_updated_at();
create trigger order_items_touch before update on order_items for each row execute function pos_touch_updated_at();

alter table pos_tables      enable row level security;
alter table menu_categories enable row level security;
alter table menu_items      enable row level security;
alter table menu_recipes    enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
