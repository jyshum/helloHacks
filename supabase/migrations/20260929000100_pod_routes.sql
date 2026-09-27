-- Partner A: cache each driver's home→campus route so riders can be matched to a
-- pickup point ON the route (a public spot) instead of their front door.
alter table commute_profiles add column if not exists route_polyline text;   -- Google encoded polyline
alter table commute_profiles add column if not exists route_minutes int;     -- driving time home→campus
-- Day-of: when riders were told the driver was late (so we only notify once).
alter table pod_trips add column if not exists late_notified_at timestamptz;
