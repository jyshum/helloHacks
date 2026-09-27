-- Commute pods: recurring morning carpools matched by home location + arrival time.
-- SHARED CONTRACT between Partner A (matching/pods) and Partner B (chat/notifications).
-- Add columns if you need them; don't rename or drop without telling the other side.

-- One row per user: the 3 onboarding answers.
create table commute_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  mode text not null check (mode in ('driver','rider')),
  home_lat double precision not null,
  home_lng double precision not null,
  home_area text,                      -- neighbourhood shown to others; never the address
  campus_lat double precision not null default 49.2677,
  campus_lng double precision not null default -123.247,
  campus_label text not null default 'UBC Bus Exchange',
  days smallint[] not null,            -- 1=Mon .. 5=Fri
  arrive_by time not null default '09:00',
  day_times jsonb not null default '{}'::jsonb,  -- optional per-day override, e.g. {"3":"10:00"}
  seats int not null default 3 check (seats between 1 and 6),   -- drivers only
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- A pod = one driver + riders who share days and route.
create table pods (
  id uuid primary key default uuid_generate_v4(),
  driver_id uuid not null references users(id) on delete cascade,
  campus_lat double precision not null,
  campus_lng double precision not null,
  campus_label text not null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

-- Membership. Flow: matcher creates 'invited' → rider taps Join → 'requested'
-- → driver approves → 'active' (or 'declined'). Anyone can later 'left'.
create table pod_members (
  id uuid primary key default uuid_generate_v4(),
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('driver','rider')),
  status text not null check (status in ('invited','requested','active','declined','left')),
  days smallint[] not null default '{}',     -- days this member rides with the pod
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_label text,                          -- public meeting point, not home
  pickup_time time,
  detour_minutes numeric,
  drive_minutes int,                          -- door-to-campus by car with this pod
  transit_minutes int,                        -- same trip by transit (the "time saved" pitch)
  score numeric,                              -- matcher score, higher = better fit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pod_id, user_id)
);
create index pod_members_user_idx on pod_members (user_id, status);

-- Group chat. user_id null + kind 'system' = automatic updates posted by the app.
create table pod_messages (
  id uuid primary key default uuid_generate_v4(),
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  kind text not null default 'user' check (kind in ('user','system')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index pod_messages_pod_idx on pod_messages (pod_id, created_at);

-- One row per pod per commute day. ride_id links to the existing rides table so the
-- live trip screen (/match), tracking, completion and ratings are reused as-is.
create table pod_trips (
  id uuid primary key default uuid_generate_v4(),
  pod_id uuid not null references pods(id) on delete cascade,
  trip_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','confirmed','cancelled','live','completed','missed')),
  ride_id uuid references rides(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pod_id, trip_date)
);

-- "Can't make it today" for a single member on a single day.
create table pod_skips (
  pod_id uuid not null references pods(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  trip_date date not null,
  created_at timestamptz not null default now(),
  primary key (pod_id, user_id, trip_date)
);

-- Web push subscriptions (Partner B).
create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- RLS: writes go through API routes (service role). Clients may READ pod data only
-- for pods they belong to, which is what lets Realtime deliver chat/updates to them.
alter table commute_profiles enable row level security;
alter table pods enable row level security;
alter table pod_members enable row level security;
alter table pod_messages enable row level security;
alter table pod_trips enable row level security;
alter table pod_skips enable row level security;
alter table push_subscriptions enable row level security;

create or replace function is_pod_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pod_members m join users u on u.id = m.user_id
    where m.pod_id = p and u.auth_id = auth.uid() and m.status in ('requested','active')
  );
$$;

create policy "members read pod" on pods for select using (is_pod_member(id));
create policy "members read members" on pod_members for select using (is_pod_member(pod_id));
create policy "members read messages" on pod_messages for select using (is_pod_member(pod_id));
create policy "members read trips" on pod_trips for select using (is_pod_member(pod_id));

alter publication supabase_realtime add table pod_messages;
alter publication supabase_realtime add table pod_members;
alter publication supabase_realtime add table pod_trips;
