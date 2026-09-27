-- Car photo (plate visible): reviewed by the team and shown to riders.
alter table vehicles add column if not exists photo_url text;

insert into storage.buckets (id, name, public) values ('cars', 'cars', true)
  on conflict (id) do nothing;
