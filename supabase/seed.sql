-- ============================================================
-- Seed data — run AFTER schema.sql
-- PINs: Alice=1111, Bob=2222, Carol=3333, David=4444, Eve=5555
-- Hashes generated with bcrypt rounds=12
-- ============================================================

-- Insert default settings
insert into settings (company_name, shift_start_time, late_threshold_minutes)
values ('My Company', '09:00:00', 15)
on conflict do nothing;

-- NOTE: Staff profiles require auth.users rows first.
-- Create 5 dummy auth users via Supabase Dashboard > Authentication > Add User
-- then run this SQL replacing the UUIDs with the actual IDs:

-- Example (replace UUIDs with real ones from your auth.users table):
/*
insert into profiles (id, name, designation, pin_hash, role) values
  ('00000000-0000-0000-0000-000000000001', 'Alice Johnson',  'Developer',       '$2a$12$KIFnEBMCxFbqmVoZJGF3.uSrT7sT6O3rRBZWNjByNv5q4v6gOsMNS', 'staff'),
  ('00000000-0000-0000-0000-000000000002', 'Bob Smith',      'Designer',        '$2a$12$yHiGKj4UJjgS6bI3C77C7.LJpGZV14VxbNeJP7Cv.5PZBO3h7B8u.', 'staff'),
  ('00000000-0000-0000-0000-000000000003', 'Carol White',    'QA Engineer',     '$2a$12$M0e8Jb15.F2BQFN.LJZeRe4V8Q9VVKK4hPTD22n3rXfzk1.kT9wa', 'staff'),
  ('00000000-0000-0000-0000-000000000004', 'David Brown',    'DevOps',          '$2a$12$2.3jDPCVfCwLQ8Y5aMnxFOhYrBpXX.0iNhKwAnV.1xSbYq7A2M7kW', 'staff'),
  ('00000000-0000-0000-0000-000000000005', 'Eve Davis',      'Project Manager', '$2a$12$rWLT6k2b7x4QFwDYw8OOL.a3b9pT1Ky7J7iUfpMJcyStX7x.4VyG', 'staff');
*/

-- Sample attendance for last 7 days (replace staff UUIDs accordingly):
/*
insert into attendance (staff_id, date, check_in_time, check_out_time, status) values
  ('00000000-0000-0000-0000-000000000001', current_date - 6, now() - interval '6 days' + interval '8h55m', now() - interval '6 days' + interval '17h',  'present'),
  ('00000000-0000-0000-0000-000000000001', current_date - 5, now() - interval '5 days' + interval '9h20m', now() - interval '5 days' + interval '17h',  'late'),
  ('00000000-0000-0000-0000-000000000001', current_date - 4, null, null, 'absent'),
  ('00000000-0000-0000-0000-000000000001', current_date - 3, now() - interval '3 days' + interval '8h50m', now() - interval '3 days' + interval '17h',  'present'),
  ('00000000-0000-0000-0000-000000000001', current_date - 2, now() - interval '2 days' + interval '9h05m', now() - interval '2 days' + interval '17h',  'present'),
  ('00000000-0000-0000-0000-000000000001', current_date - 1, now() - interval '1 day'  + interval '8h45m', now() - interval '1 day'  + interval '17h',  'present')
on conflict (staff_id, date) do nothing;
*/
