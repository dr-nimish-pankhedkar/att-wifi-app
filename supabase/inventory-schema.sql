-- ============================================================
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  unit text default '',
  min_level numeric(10,3) default 0,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists inventory_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references inventory_items(id) on delete cascade,
  quantity numeric(10,3) not null,
  notes text,
  logged_by uuid references profiles(id) on delete set null,
  log_date date not null default current_date,
  created_at timestamptz default now()
);

alter table inventory_items enable row level security;
alter table inventory_logs enable row level security;
create policy "admin_all_inv_items" on inventory_items for all using (is_admin());
create policy "admin_all_inv_logs"  on inventory_logs  for all using (is_admin());

-- ── Seed items from JP Foods Planner ─────────────────────────
insert into inventory_items (category, name, unit, min_level, sort_order) values
-- Dressings Box 1
('Dressings', 'imli chutney', 'pkt', 1, 10),
('Dressings', 'mayo', 'pkt', 1, 20),
('Dressings', 'tomato ketchup', 'pkt', 1, 30),
('Dressings', 'chipotle', 'pkt', 0.5, 40),
('Dressings', 'tandoori', 'pkt', 0.5, 50),
('Dressings', 'white pasta sauce', 'pkt', 0.5, 60),
('Dressings', 'pizza pasta sauce Reg', 'pkt', 0.5, 70),
('Dressings', 'pizza pasta sauce JAIN', 'pkt', 0.5, 80),
('Dressings', 'cheese dressing', 'pkt', 0.5, 90),
('Dressings', 'Cheese Blend', 'pkt', 0.5, 100),
('Dressings', 'Fresh cream', 'pkt', 1, 110),
('Dressings', 'Sunflower oil 1L', 'L', 1, 120),
-- Masale Box 1
('Masale', 'Snapin cheese garlic masala', 'pkt', 1, 10),
('Masale', 'peri peri big pack', 'pkt', 1, 20),
('Masale', 'Snapin peri peri pouches', 'pkt', 0, 30),
('Masale', 'Maggi masala 60pc bag', 'pkt', 1, 40),
('Masale', 'Chat Masala', 'pkt', 0.5, 50),
('Masale', 'Salt', 'kg', 1, 60),
-- Sachets Box 1
('Sachets', 'Coffee sachets', 'box', 0.25, 10),
('Sachets', 'Sugar sachets', 'box', 0.25, 20),
('Sachets', 'Ketchup sachets', 'box', 0.25, 30),
('Sachets', 'Oregano sachets', 'box', 0.25, 40),
('Sachets', 'Chilli Flakes sachets', 'box', 0.25, 50),
-- Beverage material Box 2
('Beverage', 'Sugar', 'kg', 0.5, 10),
('Beverage', 'elaichi', 'g', 50, 20),
('Beverage', 'Tea Masala', 'pkt', 0.5, 30),
('Beverage', 'Tata Agni 1.5kg', 'pkt', 0.5, 40),
('Beverage', 'Society Tea 1kg', 'pkt', 0.5, 50),
('Beverage', 'bru 200g', 'pkt', 1, 60),
('Beverage', 'continental 200g', 'pkt', 1, 70),
('Beverage', 'coco premix', 'pkt', 10, 80),
('Beverage', 'Kairi Panna Premix', 'pkt', 2, 90),
('Beverage', 'Sabja', 'g', 10, 100),
('Beverage', 'Chocolate powder', 'pkt', 1, 110),
('Beverage', 'Dark compound slab', 'pkt', 0.25, 120),
('Beverage', 'Cocoa powder', 'pkt', 1, 130),
-- Crispies Box 3
('Crispies', 'yellow shev', 'pkt', 0.5, 10),
('Crispies', 'orange shev', 'pkt', 0.5, 20),
('Crispies', 'Chana dal', 'pkt', 0.5, 30),
('Crispies', 'kurkure', 'pkt', 1, 40),
('Crispies', 'lays - Cream n onion', 'pkt', 1, 50),
('Crispies', 'lays - Magic masala', 'pkt', 1, 60),
('Crispies', 'nachos', 'pkt', 1, 70),
('Crispies', 'maggi', 'pkt', 1, 80),
('Crispies', 'Khicha papad', 'pcs', 10, 90),
('Crispies', 'Khakra', 'pcs', 10, 100),
('Crispies', 'Raw Makhana', 'pkt', 0.25, 110),
('Crispies', 'Potato Chips', 'pkt', 0.5, 120),
('Crispies', 'Pasta', 'pkt', 0.5, 130),
('Crispies', 'Raw Shengdana', 'g', 0, 140),
-- Packaging Box 4
('Packaging', 'Straw small', 'pkt', 0, 10),
('Packaging', 'Straw big', 'pkt', 1, 20),
('Packaging', 'Container & lids small', 'pcs', 10, 30),
('Packaging', 'Container & lids big', 'pcs', 10, 40),
('Packaging', 'Beverage container', 'pcs', 10, 50),
('Packaging', 'Stirrer', 'pkt', 0, 60),
('Packaging', 'Shev pav parcel box', 'pcs', 20, 70),
('Packaging', 'Cups big', 'pcs', 0, 80),
('Packaging', 'Bags small', 'pcs', 10, 90),
('Packaging', 'Bags big', 'pcs', 10, 100),
('Packaging', 'Pizza Boxes', 'pcs', 10, 110),
-- Freezer
('Freezer', 'Paneer', 'kg', 2, 10),
('Freezer', 'Aloo tikki Patty', 'pcs', 5, 20),
('Freezer', 'Veggie patty', 'pcs', 5, 30),
('Freezer', 'Sweet corn 1kg', 'pkt', 0.5, 40),
('Freezer', 'Diced cheese blend 1kg', 'pkt', 1, 50),
('Freezer', 'Fries 2.5kg', 'pkt', 1, 60),
('Freezer', 'Vanilla Icecream', 'tub', 0.25, 70),
('Freezer', 'Cheese block 1kg', 'pkt', 1, 80),
('Freezer', 'Butter 500g', 'pkt', 1, 90),
-- Extras
('Extras', 'Water 500ml', 'btl', 5, 10),
('Extras', 'Soda', 'btl', 1, 20),
('Extras', 'Water 1L', 'btl', 5, 30)
on conflict do nothing;
