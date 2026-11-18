-- Public bill link + customer feedback + bill details shown on the bill page.
alter table settings add column if not exists bill_address text;
alter table settings add column if not exists bill_phone text;
alter table settings add column if not exists bill_fssai text;
alter table settings add column if not exists review_url text;

alter table orders add column if not exists public_token text unique default encode(extensions.gen_random_bytes(8), 'hex');
update orders set public_token = encode(extensions.gen_random_bytes(8), 'hex') where public_token is null;
alter table orders alter column public_token set not null;
alter table orders add column if not exists feedback_rating text check (feedback_rating in ('loved','okay','improve'));
alter table orders add column if not exists feedback_comment text;
alter table orders add column if not exists feedback_at timestamptz;
