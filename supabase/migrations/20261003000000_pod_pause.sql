-- Drivers can pause a pod instead of closing it: riders keep their spot, no trips run,
-- and the driver can resume. Paused pods close on their own after 7 days (nightly job).
alter table pods drop constraint if exists pods_status_check;
alter table pods add constraint pods_status_check check (status in ('active', 'paused', 'archived'));
alter table pods add column if not exists paused_at timestamptz;
