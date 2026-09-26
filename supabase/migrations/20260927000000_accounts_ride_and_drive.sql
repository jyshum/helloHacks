-- One account can both ride and drive; the mode is chosen after login.
alter table users alter column role set default 'both';

-- Real sign-ups (they have a login) become 'both'. Seed users keep their
-- demo roles so profiles still read "Driver" / "Rider".
update users set role = 'both' where auth_id is not null and role <> 'both';
