-- ============================================================
-- Run in Supabase SQL Editor AFTER inventory-schema.sql
-- ============================================================

-- Buckets table (physical boxes / storage locations)
create table if not exists inventory_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table inventory_buckets enable row level security;
create policy "admin_all_buckets"  on inventory_buckets for all    using (is_admin());
create policy "staff_read_buckets" on inventory_buckets for select using (true);

-- Add bucket_id FK to items
alter table inventory_items
  add column if not exists bucket_id uuid references inventory_buckets(id) on delete set null;

-- ── Seed buckets matching existing categories ─────────────
insert into inventory_buckets (name, sort_order) values
('Dressings',  10),
('Masale',     20),
('Sachets',    30),
('Beverage',   40),
('Crispies',   50),
('Packaging',  60),
('Freezer',    70),
('Extras',     80)
on conflict do nothing;

-- Map every item to its matching bucket
update inventory_items i
set bucket_id = b.id
from inventory_buckets b
where b.name = i.category
  and i.bucket_id is null;

-- Vendor columns (primary and alternative vendor names per item)
alter table inventory_items add column if not exists vendor_1 text default '';
alter table inventory_items add column if not exists vendor_2 text default '';
