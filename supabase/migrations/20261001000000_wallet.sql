-- Demo wallet: a ledger of fake money. Balance = sum of a user's entries.
-- Riders pay their gas share to the driver when a trip ends. Top-ups and cash-outs are simulated.
create table if not exists wallet_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  amount_cents int not null,
  kind text not null check (kind in ('welcome', 'topup', 'ride', 'earning', 'cashout')),
  request_id uuid references ride_requests(id) on delete set null,
  other_user_id uuid references users(id) on delete set null,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists wallet_entries_user on wallet_entries (user_id, created_at desc);
-- A ride is only ever paid once (one charge + one earning per request).
create unique index if not exists wallet_once_per_request on wallet_entries (request_id, kind) where request_id is not null;

alter table wallet_entries enable row level security;
create policy "read own wallet" on wallet_entries for select
  using (user_id in (select id from users where auth_id = auth.uid()));
