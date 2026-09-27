-- Partner B: reports on pod chat messages, reviewed on /admin.
-- message_body / message_user_id snapshot the message so the report survives if the
-- message is later removed by an admin.
create table pod_reports (
  id uuid primary key default uuid_generate_v4(),
  pod_id uuid not null references pods(id) on delete cascade,
  message_id uuid references pod_messages(id) on delete set null,
  reporter_id uuid not null references users(id) on delete cascade,
  reason text not null check (length(reason) between 1 and 500),
  message_body text,
  message_user_id uuid references users(id) on delete set null,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);
create index pod_reports_open_idx on pod_reports (resolved, created_at);

-- No client policies: reports are written and read only through API routes (service role).
alter table pod_reports enable row level security;
