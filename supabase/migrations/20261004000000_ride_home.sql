-- Ride home: a pod's driver can also drive riders home in the afternoon.
-- home_leave_at = when the driver usually leaves campus (null = doesn't drive home);
-- home_day_times = per-weekday overrides, like day_times for mornings.
alter table commute_profiles add column if not exists home_leave_at time;
alter table commute_profiles add column if not exists home_day_times jsonb not null default '{}'::jsonb;

-- Riders opt in per day ("I'm in" for Monday's ride home). Off by default.
create table if not exists pod_home_rides (
  id uuid primary key default uuid_generate_v4(),
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  trip_date date not null,
  created_at timestamptz not null default now(),
  unique (pod_id, user_id, trip_date)
);
create index if not exists pod_home_rides_pod on pod_home_rides (pod_id, trip_date);
alter table pod_home_rides enable row level security;

-- Demo drivers head home about 8 hours after they arrive, so seeded pods show a ride home.
update commute_profiles c
   set home_leave_at = (c.arrive_by + interval '8 hours')::time
  from users u
 where u.id = c.user_id and u.auth_id is null and c.mode = 'driver' and c.home_leave_at is null;
