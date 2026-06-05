-- Daily kitchen inventory tables
-- Kitchen items tracked twice daily (IN and Closing)

create table if not exists daily_kitchen_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        text not null default '',
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists daily_kitchen_logs (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references daily_kitchen_items(id) on delete cascade,
  log_date    date not null,
  shift       text not null check (shift in ('in', 'closing')),
  quantity    numeric not null,
  logged_by   uuid references profiles(id),
  created_at  timestamptz not null default now(),
  unique (item_id, log_date, shift)
);

-- RLS
alter table daily_kitchen_items enable row level security;
alter table daily_kitchen_logs  enable row level security;

create policy "public read kitchen items"  on daily_kitchen_items for select using (true);
create policy "public read kitchen logs"   on daily_kitchen_logs  for select using (true);
create policy "public insert kitchen logs" on daily_kitchen_logs  for insert with check (true);
create policy "public update kitchen logs" on daily_kitchen_logs  for update using (true);
create policy "public delete kitchen logs" on daily_kitchen_logs  for delete using (true);
create policy "admin manage kitchen items" on daily_kitchen_items for all using (true);

-- Seed items
insert into daily_kitchen_items (name, unit, sort_order) values
  ('Shev pav Bun',        'pcs', 10),
  ('Burger Bun',          'pcs', 20),
  ('Bun Maska',           'pcs', 30),
  ('Pizza base',          'pcs', 40),
  ('Sandwich Bread',      'pcs', 50),
  ('Khichiya Papad',      'pcs', 60),
  ('Surti Coco',          'btl', 70),
  ('Onion',               'pcs', 80),
  ('Tomato',              'pcs', 90),
  ('Cucumber',            'pcs', 100),
  ('Lemon',               'pcs', 110),
  ('Capsicum',            'pcs', 120),
  ('Bell pepper - Red',   'pcs', 130),
  ('Bell pepper - Yellow','pcs', 140),
  ('Kairi',               'pcs', 150),
  ('Roasted Makhana',     'bowl',160),
  ('Raw Makhana',         'pkt', 170),
  ('Milk',                'L',   180),
  ('Coriander',           '',    190),
  ('Paneer',              'pkt', 200),
  ('Maggi',               'pkt', 210),
  ('Fresh Cream',         'pkt', 220),
  ('Potato',              'kg',  230)
on conflict do nothing;
