-- ============================================================
-- Run this in Supabase SQL Editor to add salary & leave features
-- ============================================================

-- 1. Add new columns to profiles
alter table profiles add column if not exists date_of_joining date;
alter table profiles add column if not exists birthdate date;
alter table profiles add column if not exists aadhar_url text;
alter table profiles add column if not exists pan_url text;

-- 2. Salary components per staff member
create table if not exists staff_salary (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid unique references profiles(id) on delete cascade,
  base_pay numeric(10,2) default 0,
  fuel_allowance numeric(10,2) default 0,
  fixed_bonus numeric(10,2) default 0,  -- monthly equivalent; paid as 6x every 6 months from DOJ
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Monthly salary overrides (manual adjustments)
create table if not exists salary_overrides (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete cascade,
  month date not null,                   -- first day of month, e.g. 2024-06-01
  base_pay_override numeric(10,2),
  fuel_override numeric(10,2),
  bonus_override numeric(10,2),
  notes text,
  created_at timestamptz default now(),
  unique(staff_id, month)
);

-- 4. Leave records (paid, comp off granted, comp off used, unpaid)
create table if not exists leaves (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete cascade,
  leave_date date not null,
  type text check (type in ('paid', 'comp_off', 'comp_off_used', 'unpaid')) default 'paid',
  status text check (status in ('approved', 'rejected')) default 'approved',
  notes text,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table staff_salary enable row level security;
alter table salary_overrides enable row level security;
alter table leaves enable row level security;

create policy "admin_all_staff_salary"    on staff_salary    for all using (is_admin());
create policy "admin_all_salary_override" on salary_overrides for all using (is_admin());
create policy "admin_all_leaves"          on leaves           for all using (is_admin());

-- ============================================================
-- Storage bucket for private staff documents (Aadhaar, PAN)
-- Run via Supabase Dashboard > Storage, or uncomment:
-- insert into storage.buckets (id, name, public) values ('staff-docs', 'staff-docs', false);
-- ============================================================
