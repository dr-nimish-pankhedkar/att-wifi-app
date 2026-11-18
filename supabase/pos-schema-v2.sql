-- POS v2: configurable floor layout (areas), item variations, add-on groups.
-- Everything here is editable from the admin UI so no code change is needed
-- to add a table, an area, a menu item, a size/preparation option or an add-on.

create table if not exists pos_areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,        -- "Ground Floor", "First Floor", "Outside"
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table pos_tables drop column if exists area;
alter table pos_tables add column if not exists area_id uuid references pos_areas(id) on delete cascade;
alter table pos_tables add column if not exists seats int not null default 4 check (seats > 0);
create unique index if not exists pos_tables_area_name_uq on pos_tables (area_id, name);

alter table menu_items add column if not exists description text;
alter table menu_items add column if not exists food_type text not null default 'veg'
  check (food_type in ('veg','nonveg','egg'));

-- e.g. group "Preparation": Regular ₹45 / Jain ₹45; group "Size": Small ₹40 / Large ₹60.
-- When an item has variations, the captain must pick one and its price is used.
create table if not exists menu_variations (
  id            uuid primary key default gen_random_uuid(),
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  group_name    text not null default 'Variant',
  name          text not null,
  price         numeric(10,2) not null check (price >= 0),
  sort_order    int not null default 0,
  active        boolean not null default true,
  unique (menu_item_id, name)
);

create table if not exists addon_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,        -- "Add On Sauces", "Add On Cheese"
  min_select  int not null default 0 check (min_select >= 0),
  max_select  int not null default 1 check (max_select >= 1),
  sort_order  int not null default 0,
  active      boolean not null default true
);

create table if not exists addon_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references addon_groups(id) on delete cascade,
  name        text not null,
  price       numeric(10,2) not null default 0 check (price >= 0),
  sort_order  int not null default 0,
  active      boolean not null default true,
  unique (group_id, name)
);

create table if not exists menu_item_addon_groups (
  menu_item_id   uuid not null references menu_items(id) on delete cascade,
  addon_group_id uuid not null references addon_groups(id) on delete cascade,
  primary key (menu_item_id, addon_group_id)
);

-- Order line snapshots of the chosen variation and add-ons.
-- price = per-unit price including variation and add-ons.
alter table order_items add column if not exists variation_id   uuid references menu_variations(id) on delete set null;
alter table order_items add column if not exists variation_name text;
alter table order_items add column if not exists addons jsonb not null default '[]'::jsonb;

create index if not exists menu_variations_item_idx on menu_variations (menu_item_id);
create index if not exists addon_options_group_idx  on addon_options (group_id);

alter table pos_areas              enable row level security;
alter table menu_variations        enable row level security;
alter table addon_groups           enable row level security;
alter table addon_options          enable row level security;
alter table menu_item_addon_groups enable row level security;
