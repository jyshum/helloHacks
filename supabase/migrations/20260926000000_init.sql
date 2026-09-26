create extension if not exists "uuid-ossp";

create table users (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid references auth.users(id) on delete cascade,
  ubc_email text unique not null,
  email_verified boolean default false,
  full_name text,
  faculty text,
  year int,
  photo_url text,
  role text check (role in ('driver','rider','both')) default 'rider',
  rating_avg numeric default 5.0,
  rating_count int default 0,
  chat_preference text check (chat_preference in ('chatty','quiet','no_preference')) default 'no_preference',
  license_verified boolean default false,
  created_at timestamptz default now()
);

create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  make_model text, license_plate text, province text, color text,
  seat_capacity int default 3, is_ev boolean default false,
  created_at timestamptz default now()
);

create table rides (
  id uuid primary key default uuid_generate_v4(),
  driver_id uuid references users(id) on delete cascade,
  origin_lat double precision not null, origin_lng double precision not null, origin_label text,
  destination_lat double precision not null, destination_lng double precision not null, destination_label text,
  departure_time timestamptz not null,
  seats_available int not null default 3,
  status text check (status in ('posted','active','completed','cancelled')) default 'posted',
  created_at timestamptz default now()
);

create table ride_requests (
  id uuid primary key default uuid_generate_v4(),
  ride_id uuid references rides(id) on delete cascade,
  rider_id uuid references users(id) on delete cascade,
  pickup_lat double precision not null, pickup_lng double precision not null, pickup_label text,
  dropoff_lat double precision not null, dropoff_lng double precision not null, dropoff_label text,
  detour_minutes numeric, detour_km numeric, estimated_cost_cents int,
  status text check (status in ('pending','accepted','declined','completed','cancelled')) default 'pending',
  created_at timestamptz default now()
);

create table ratings (
  id uuid primary key default uuid_generate_v4(),
  ride_id uuid references rides(id) on delete cascade,
  rater_id uuid references users(id) on delete cascade,
  ratee_id uuid references users(id) on delete cascade,
  score int check (score between 1 and 5),
  comment text,
  created_at timestamptz default now()
);

-- Demo-friendly RLS: readable broadly, tighten before real use.
alter table users enable row level security;
alter table vehicles enable row level security;
alter table rides enable row level security;
alter table ride_requests enable row level security;
alter table ratings enable row level security;

create policy "read own user" on users for select using (auth.uid() = auth_id);
create policy "update own user" on users for update using (auth.uid() = auth_id);
create policy "insert own user" on users for insert with check (auth.uid() = auth_id);
create policy "read rides" on rides for select using (true);
create policy "write rides" on rides for insert with check (true);
create policy "update rides" on rides for update using (true);
create policy "read requests" on ride_requests for select using (true);
create policy "write requests" on ride_requests for insert with check (true);
create policy "update requests" on ride_requests for update using (true);
create policy "read ratings" on ratings for select using (true);
create policy "write ratings" on ratings for insert with check (true);

-- Realtime: stream ride + request changes to the map and driver inbox.
alter publication supabase_realtime add table rides;
alter publication supabase_realtime add table ride_requests;

-- Storage: public bucket for profile photos.
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar upload" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
