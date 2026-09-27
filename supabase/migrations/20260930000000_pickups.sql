-- Driver marks each rider as picked up (pickup checklist on the live trip screen).
alter table ride_requests add column if not exists picked_up_at timestamptz;
