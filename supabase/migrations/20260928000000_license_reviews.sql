-- Driver license verification by manual team review (replaces Stripe Identity).
create table license_reviews (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  license_path text not null,        -- photo of the license (front)
  selfie_path text not null,         -- selfie holding the license
  record_path text,                  -- optional ICBC driving record
  status text not null check (status in ('pending','approved','rejected')) default 'pending',
  reject_reason text,
  reviewed_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);
create index license_reviews_user_idx on license_reviews (user_id, created_at desc);

-- Server-only: no policies, so only the service role can read or write.
alter table license_reviews enable row level security;

-- Private bucket for license photos. No storage policies: only the service
-- role can read, and admins view files through short-lived signed URLs.
insert into storage.buckets (id, name, public) values ('licenses', 'licenses', false)
  on conflict (id) do nothing;
