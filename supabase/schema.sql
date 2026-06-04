-- ============================================================
-- Run this in your Supabase SQL Editor (project > SQL Editor)
-- ============================================================

-- Settings table
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  company_name text default 'My Company',
  shift_start_time time default '09:00:00',
  late_threshold_minutes int default 15,
  allowed_ips text default '',   -- comma-separated office public IPs
  updated_at timestamptz default now()
);

-- If you already ran the schema, add the column with:
-- alter table settings add column if not exists allowed_ips text default '';

-- Profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  designation text,
  pin_hash text not null,
  photo_url text,
  role text check (role in ('admin', 'staff')) default 'staff',
  created_at timestamptz default now()
);

-- Attendance
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete cascade,
  date date not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  status text check (status in ('present','late','absent')) default 'absent',
  override_by_admin boolean default false,
  notes text,
  created_at timestamptz default now(),
  unique(staff_id, date)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table settings enable row level security;
alter table profiles enable row level security;
alter table attendance enable row level security;

-- Helper: is the calling user an admin?
create or replace function is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

-- settings policies
create policy "admin_all_settings"   on settings for all    using (is_admin());
create policy "staff_read_settings"  on settings for select using (auth.role() = 'authenticated');

-- profiles policies
create policy "admin_all_profiles"   on profiles for all    using (is_admin());
create policy "staff_read_own"       on profiles for select using (auth.uid() = id);

-- attendance policies
create policy "admin_all_attendance" on attendance for all    using (is_admin());
create policy "staff_read_own_att"   on attendance for select using (auth.uid() = staff_id);

-- ============================================================
-- Storage bucket (run separately or via Supabase dashboard)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('staff-photos', 'staff-photos', true);
