-- =============================================================================
-- supabase/seed.sql — demo seed data for the UBC carpool app (HelloHacks)
-- =============================================================================
--
-- What this does
--   Populates the database with believable UBC students, cars, rides, ride
--   requests and ratings so every screen of the core loop has something to show:
--     * 20 verified users   (8 drivers, 12 riders)
--     * 8 vehicles          (one per driver, BC plates, 2 EVs)
--     * 12 rides            (10 upcoming 'posted' rides into UBC, 2 'completed')
--     * 10 ride requests    (4 pending, 2 accepted, 4 completed)
--     * 8 ratings           (driver <-> rider, on the completed rides only)
--
--   Gas contribution follows the app's formula:
--     estimated_cost_cents = round((200 + detour_km * 45) / 5) * 5
--
-- Re-running
--   Every seeded row has a UUID starting with "5eed" (users 5eed0001-,
--   vehicles 5eed0002-, rides 5eed0003-, ride_requests 5eed0004-,
--   ratings 5eed0005-). The cleanup block at the top deletes only those rows
--   (plus anything that references them), so re-running refreshes the demo
--   data and departure times without touching real sign-ups.
--
-- How to run
--   * Supabase dashboard: SQL Editor -> New query -> paste this file -> Run
--   * Supabase CLI (local): `supabase db reset` runs supabase/seed.sql automatically
--   * psql: psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Note: if public.users.id has a foreign key to auth.users(id), these inserts
-- will fail because the seed users have no auth accounts. In that case, drop
-- that constraint for the demo or create matching auth users first.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Cleanup: remove previous seed rows (children first to satisfy foreign keys)
-- -----------------------------------------------------------------------------

-- payments may reference seeded ride_requests (e.g. test payments made during
-- a demo run); only touch it if the table exists.
do $$
begin
  if to_regclass('public.payments') is not null then
    execute $q$
      delete from public.payments
      where ride_request_id in (
        select id from public.ride_requests
        where id::text like '5eed0004-%'
           or rider_id::text like '5eed0001-%'
           or ride_id in (
             select id from public.rides
             where id::text like '5eed0003-%' or driver_id::text like '5eed0001-%'
           )
      )
    $q$;
  end if;
end $$;

delete from public.ratings
where id::text like '5eed0005-%'
   or rater_id::text like '5eed0001-%'
   or ratee_id::text like '5eed0001-%'
   or ride_id in (
     select id from public.rides
     where id::text like '5eed0003-%' or driver_id::text like '5eed0001-%'
   );

delete from public.ride_requests
where id::text like '5eed0004-%'
   or rider_id::text like '5eed0001-%'
   or ride_id in (
     select id from public.rides
     where id::text like '5eed0003-%' or driver_id::text like '5eed0001-%'
   );

delete from public.rides
where id::text like '5eed0003-%'
   or driver_id::text like '5eed0001-%';

delete from public.vehicles
where id::text like '5eed0002-%'
   or user_id::text like '5eed0001-%';

delete from public.users
where id::text like '5eed0001-%';

-- -----------------------------------------------------------------------------
-- Users: 8 drivers (…01–…08) and 12 riders (…09–…20)
-- -----------------------------------------------------------------------------

insert into public.users
  (id, ubc_email, email_verified, full_name, faculty, year, photo_url, role, rating_avg, rating_count, chat_preference)
values
  -- drivers
  ('5eed0001-0000-0000-0000-000000000001', 'priya.sharma@student.ubc.ca',    true, 'Priya Sharma',    'Applied Science',           4, null, 'driver', 4.9, 42, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000002', 'daniel.kim@student.ubc.ca',      true, 'Daniel Kim',      'Sauder School of Business', 3, null, 'driver', 4.7, 18, 'no_preference'),
  ('5eed0001-0000-0000-0000-000000000003', 'mateo.alvarez@student.ubc.ca',   true, 'Mateo Alvarez',   'Science',                   5, null, 'both',   4.8, 65, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000004', 'hannah.nguyen@student.ubc.ca',   true, 'Hannah Nguyen',   'Kinesiology',               3, null, 'driver', 5.0,  7, 'quiet'),
  ('5eed0001-0000-0000-0000-000000000005', 'owen.macleod@student.ubc.ca',    true, 'Owen MacLeod',    'Forestry',                  4, null, 'driver', 4.6, 23, 'quiet'),
  ('5eed0001-0000-0000-0000-000000000006', 'aisha.rahman@student.ubc.ca',    true, 'Aisha Rahman',    'Land and Food Systems',     2, null, 'both',   4.9, 31, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000007', 'liam.chen@student.ubc.ca',       true, 'Liam Chen',       'Applied Science',           5, null, 'driver', 4.5, 80, 'no_preference'),
  ('5eed0001-0000-0000-0000-000000000008', 'sofia.rossi@student.ubc.ca',     true, 'Sofia Rossi',     'Arts',                      4, null, 'driver', 4.8, 12, 'quiet'),
  -- riders
  ('5eed0001-0000-0000-0000-000000000009', 'emily.tran@student.ubc.ca',      true, 'Emily Tran',      'Science',                   1, null, 'rider',  4.8,  5, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000010', 'arjun.patel@student.ubc.ca',     true, 'Arjun Patel',     'Applied Science',           2, null, 'rider',  4.7, 14, 'no_preference'),
  ('5eed0001-0000-0000-0000-000000000011', 'chloe.tremblay@student.ubc.ca',  true, 'Chloé Tremblay',  'Arts',                      3, null, 'rider',  4.9,  9, 'quiet'),
  ('5eed0001-0000-0000-0000-000000000012', 'kwame.mensah@student.ubc.ca',    true, 'Kwame Mensah',    'Sauder School of Business', 4, null, 'rider',  4.6, 22, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000013', 'yuki.tanaka@student.ubc.ca',     true, 'Yuki Tanaka',     'Arts (Media Studies)',      2, null, 'rider',  5.0,  3, 'quiet'),
  ('5eed0001-0000-0000-0000-000000000014', 'isabella.garcia@student.ubc.ca', true, 'Isabella Garcia', 'Kinesiology',               1, null, 'rider',  4.4,  6, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000015', 'noah.thompson@student.ubc.ca',   true, 'Noah Thompson',   'Forestry',                  3, null, 'rider',  4.7, 11, 'no_preference'),
  ('5eed0001-0000-0000-0000-000000000016', 'fatima.haddad@student.ubc.ca',   true, 'Fatima Haddad',   'Science',                   4, null, 'rider',  4.9, 27, 'quiet'),
  ('5eed0001-0000-0000-0000-000000000017', 'ethan.wong@student.ubc.ca',      true, 'Ethan Wong',      'Applied Science',           1, null, 'rider',  4.5,  4, 'no_preference'),
  ('5eed0001-0000-0000-0000-000000000018', 'mei.lin@student.ubc.ca',         true, 'Mei Lin',         'Land and Food Systems',     5, null, 'rider',  4.8, 38, 'chatty'),
  ('5eed0001-0000-0000-0000-000000000019', 'samuel.okafor@student.ubc.ca',   true, 'Samuel Okafor',   'Sauder School of Business', 2, null, 'rider',  4.6,  8, 'quiet'),
  ('5eed0001-0000-0000-0000-000000000020', 'zara.hussain@student.ubc.ca',    true, 'Zara Hussain',    'Arts',                      3, null, 'rider',  4.9, 16, 'chatty');

-- -----------------------------------------------------------------------------
-- Vehicles: one per driver
-- -----------------------------------------------------------------------------

insert into public.vehicles
  (id, user_id, make_model, license_plate, province, color, seat_capacity, is_ev)
values
  ('5eed0002-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', 'Honda Civic',     'LK7 42T', 'BC', 'Blue',   4, false),
  ('5eed0002-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000002', 'Toyota Corolla',  'RE3 81M', 'BC', 'White',  4, false),
  ('5eed0002-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000003', 'Tesla Model 3',   'SV8 14R', 'BC', 'Grey',   4, true),
  ('5eed0002-0000-0000-0000-000000000004', '5eed0001-0000-0000-0000-000000000004', 'Mazda3',          'GH2 57W', 'BC', 'Red',    3, false),
  ('5eed0002-0000-0000-0000-000000000005', '5eed0001-0000-0000-0000-000000000005', 'Hyundai Elantra', 'BT6 30N', 'BC', 'Silver', 4, false),
  ('5eed0002-0000-0000-0000-000000000006', '5eed0001-0000-0000-0000-000000000006', 'Nissan Leaf',     'AR9 72J', 'BC', 'White',  4, true),
  ('5eed0002-0000-0000-0000-000000000007', '5eed0001-0000-0000-0000-000000000007', 'Honda Civic',     'KD1 88F', 'BC', 'Black',  2, false),
  ('5eed0002-0000-0000-0000-000000000008', '5eed0001-0000-0000-0000-000000000008', 'Toyota Corolla',  'MV4 25P', 'BC', 'Grey',   3, false);

-- -----------------------------------------------------------------------------
-- Rides: all into UBC Nest (campus core). …01–…10 upcoming, …11–…12 completed.
-- seats_available = vehicle capacity minus accepted/completed riders.
-- -----------------------------------------------------------------------------

insert into public.rides
  (id, driver_id, origin_lat, origin_lng, origin_label, destination_lat, destination_lng, destination_label, departure_time, seats_available, status)
values
  -- upcoming
  ('5eed0003-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', 49.2690, -123.1550, 'Kitsilano (W 4th Ave & Vine St)',        49.2666, -123.2500, 'UBC Nest', now() + interval '20 minutes',  3, 'posted'),
  ('5eed0003-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000002', 49.2100, -123.1300, 'Marpole (Granville St & SW Marine Dr)',  49.2666, -123.2500, 'UBC Nest', now() + interval '35 minutes',  4, 'posted'),
  ('5eed0003-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000003', 49.1670, -123.1370, 'Richmond (Brighouse Station)',           49.2666, -123.2500, 'UBC Nest', now() + interval '45 minutes',  3, 'posted'),
  ('5eed0003-0000-0000-0000-000000000004', '5eed0001-0000-0000-0000-000000000004', 49.2270, -123.0000, 'Metrotown, Burnaby',                     49.2666, -123.2500, 'UBC Nest', now() + interval '30 minutes',  3, 'posted'),
  ('5eed0003-0000-0000-0000-000000000005', '5eed0001-0000-0000-0000-000000000005', 49.2620, -123.0690, 'Commercial–Broadway Station',            49.2666, -123.2500, 'UBC Nest', now() + interval '25 minutes',  4, 'posted'),
  ('5eed0003-0000-0000-0000-000000000006', '5eed0001-0000-0000-0000-000000000006', 49.2510, -123.2340, 'Wesbrook Village',                       49.2666, -123.2500, 'UBC Nest', now() + interval '10 minutes',  4, 'posted'),
  ('5eed0003-0000-0000-0000-000000000007', '5eed0001-0000-0000-0000-000000000007', 49.2560, -123.2400, 'W 16th Ave & Acadia Rd',                 49.2666, -123.2500, 'UBC Nest', now() + interval '15 minutes',  2, 'posted'),
  ('5eed0003-0000-0000-0000-000000000008', '5eed0001-0000-0000-0000-000000000008', 49.2640, -123.1690, 'Kitsilano (W Broadway & Macdonald St)',  49.2666, -123.2500, 'UBC Nest', now() + interval '50 minutes',  3, 'posted'),
  ('5eed0003-0000-0000-0000-000000000009', '5eed0001-0000-0000-0000-000000000002', 49.2330, -123.1160, 'Oakridge (Cambie St & W 41st Ave)',      49.2666, -123.2500, 'UBC Nest', now() + interval '90 minutes',  4, 'posted'),
  ('5eed0003-0000-0000-0000-000000000010', '5eed0001-0000-0000-0000-000000000004', 49.2384, -123.0318, 'Joyce–Collingwood Station',              49.2666, -123.2500, 'UBC Nest', now() + interval '120 minutes', 3, 'posted'),
  -- completed (history for profiles and ratings)
  ('5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000001', 49.2690, -123.1550, 'Kitsilano (W 4th Ave & Vine St)',        49.2666, -123.2500, 'UBC Nest', now() - interval '1 day',       2, 'completed'),
  ('5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000003', 49.1670, -123.1370, 'Richmond (Brighouse Station)',           49.2666, -123.2500, 'UBC Nest', now() - interval '2 days',      2, 'completed');

-- -----------------------------------------------------------------------------
-- Ride requests: pickups sit on or near each driver's route into campus.
-- estimated_cost_cents = round((200 + detour_km * 45) / 5) * 5
-- -----------------------------------------------------------------------------

insert into public.ride_requests
  (id, ride_id, rider_id, pickup_lat, pickup_lng, pickup_label, dropoff_lat, dropoff_lng, dropoff_label, detour_minutes, detour_km, estimated_cost_cents, status)
values
  -- pending: populate drivers' incoming request lists
  ('5eed0004-0000-0000-0000-000000000001', '5eed0003-0000-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000009',
     49.2340, -123.1550, 'Kerrisdale (W 41st Ave & East Blvd)',   49.2666, -123.2500, 'UBC Nest',                 2, 0.6, 225, 'pending'),
  ('5eed0004-0000-0000-0000-000000000002', '5eed0003-0000-0000-0000-000000000004', '5eed0001-0000-0000-0000-000000000010',
     49.2330, -123.1160, 'Oakridge–41st Station',                 49.2620, -123.2494, 'Kaiser Building',          4, 1.4, 265, 'pending'),
  ('5eed0004-0000-0000-0000-000000000003', '5eed0003-0000-0000-0000-000000000005','5eed0001-0000-0000-0000-000000000012',
     49.2630, -123.1150, 'Broadway–City Hall Station',            49.2649, -123.2537, 'Sauder School of Business', 3, 1.0, 245, 'pending'),
  ('5eed0004-0000-0000-0000-000000000004', '5eed0003-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000013',
     49.2685, -123.1856, 'W 4th Ave & Alma St',                   49.2595, -123.2570, 'Totem Park Residence',     2, 0.9, 240, 'pending'),
  -- accepted: upcoming rides with a confirmed rider
  ('5eed0004-0000-0000-0000-000000000005', '5eed0003-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000011',
     49.2728, -123.1540, 'Cornwall Ave & Yew St',                 49.2690, -123.2540, 'Buchanan Building',        3, 1.2, 255, 'accepted'),
  ('5eed0004-0000-0000-0000-000000000006', '5eed0003-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000014',
     49.2096, -123.1170, 'Marine Drive Station',                  49.2680, -123.2488, 'Student Recreation Centre', 5, 2.2, 300, 'accepted'),
  -- completed: trip history behind the ratings below
  ('5eed0004-0000-0000-0000-000000000007', '5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000016',
     49.2638, -123.1530, 'W Broadway & Arbutus St',               49.2657, -123.2530, 'Chemistry Building',       4, 1.8, 280, 'completed'),
  ('5eed0004-0000-0000-0000-000000000008', '5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000017',
     49.2685, -123.1856, 'W 4th Ave & Alma St',                   49.2666, -123.2500, 'UBC Nest',                 2, 0.9, 240, 'completed'),
  ('5eed0004-0000-0000-0000-000000000009', '5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000018',
     49.1956, -123.1260, 'Bridgeport Station',                    49.2610, -123.2510, 'MacMillan Building',       6, 3.1, 340, 'completed'),
  ('5eed0004-0000-0000-0000-000000000010', '5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000019',
     49.2090, -123.1400, 'Granville St & W 70th Ave',             49.2649, -123.2537, 'Sauder School of Business', 3, 1.6, 270, 'completed');

-- -----------------------------------------------------------------------------
-- Ratings: two-way (driver <-> rider) on the completed rides only
-- -----------------------------------------------------------------------------

insert into public.ratings
  (id, ride_id, rater_id, ratee_id, score, comment)
values
  -- ride …11: Priya (driver) with Fatima and Ethan
  ('5eed0005-0000-0000-0000-000000000001', '5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000016', '5eed0001-0000-0000-0000-000000000001', 5, 'Super friendly, great chat about CPSC.'),
  ('5eed0005-0000-0000-0000-000000000002', '5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000016', 5, 'On time and easy pickup.'),
  ('5eed0005-0000-0000-0000-000000000003', '5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000017', '5eed0001-0000-0000-0000-000000000001', 5, 'Smooth drive and good music.'),
  ('5eed0005-0000-0000-0000-000000000004', '5eed0003-0000-0000-0000-000000000011', '5eed0001-0000-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000017', 4, 'A couple minutes late to the pickup, but all good.'),
  -- ride …12: Mateo (driver) with Mei and Samuel
  ('5eed0005-0000-0000-0000-000000000005', '5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000018', '5eed0001-0000-0000-0000-000000000003', 5, 'Spotless car and a really comfy ride.'),
  ('5eed0005-0000-0000-0000-000000000006', '5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000018', 5, 'Great conversation about the UBC Farm!'),
  ('5eed0005-0000-0000-0000-000000000007', '5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000019', '5eed0001-0000-0000-0000-000000000003', 4, 'Friendly driver, bit of traffic on the Arthur Laing Bridge.'),
  ('5eed0005-0000-0000-0000-000000000008', '5eed0003-0000-0000-0000-000000000012', '5eed0001-0000-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000019', 5, 'Easy pickup, right on time.');

commit;
