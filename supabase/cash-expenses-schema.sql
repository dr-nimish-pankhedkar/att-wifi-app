-- Cash expenses tracking
-- Staff log petty-cash spends via PIN; admin sees full history with who/when.

create table if not exists cash_expenses (
  id           uuid primary key default gen_random_uuid(),
  amount       numeric(10,2) not null check (amount > 0),
  description  text not null default '',
  category     text not null default 'Miscellaneous',
  expense_date date not null default current_date,
  staff_id     uuid references profiles(id),
  created_at   timestamptz not null default now()
);

alter table cash_expenses enable row level security;
create policy "public insert cash expenses" on cash_expenses for insert with check (true);
create policy "public select cash expenses" on cash_expenses for select using (true);
