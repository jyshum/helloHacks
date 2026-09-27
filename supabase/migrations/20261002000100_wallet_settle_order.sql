-- settle_ride v2: an auto top-up is stamped just before the charge it pays for,
-- so wallet history always reads top-up, then ride.
-- Charges one ride, all or nothing: optional auto top-up, the rider's charge and the driver's
-- earning happen in a single transaction.
--  * FOR UPDATE locks the ride request, so two calls for the same ride run one after another.
--  * The second call sees the charge already exists and returns charged = false.
--  * Even without the lock, wallet_once_per_request (request_id, kind) makes a second charge fail.
-- Like Uber, nobody ever owes: a short wallet is topped up from the card on file first.
create or replace function settle_ride(p_request uuid, p_driver_share int, p_topup_step int, p_card text)
returns table (charged boolean, amount int, topped_up int)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_balance int;
  v_topup int := 0;
begin
  select rr.id, rr.rider_id, rr.estimated_cost_cents as cents, rr.dropoff_label, ri.driver_id
    into r
    from ride_requests rr
    join rides ri on ri.id = rr.ride_id
   where rr.id = p_request
     for update of rr;
  if not found or coalesce(r.cents, 0) <= 0 then
    return query select false, 0, 0;
    return;
  end if;

  if exists (select 1 from wallet_entries where request_id = p_request and kind = 'ride') then
    return query select false, r.cents, 0;
    return;
  end if;

  select coalesce(sum(amount_cents), 0) into v_balance from wallet_entries where user_id = r.rider_id;
  if v_balance < r.cents then
    v_topup := ceil((r.cents - v_balance)::numeric / p_topup_step)::int * p_topup_step;
    insert into wallet_entries (user_id, amount_cents, kind, label, idem_key, created_at)
    values (r.rider_id, v_topup, 'topup', 'Auto top-up from ' || p_card, 'auto:' || p_request, clock_timestamp());
  end if;

  insert into wallet_entries (user_id, amount_cents, kind, request_id, other_user_id, label, created_at) values
    (r.rider_id, -r.cents, 'ride', p_request, r.driver_id, 'Ride to ' || coalesce(r.dropoff_label, 'campus'), clock_timestamp()),
    (r.driver_id, p_driver_share, 'earning', p_request, r.rider_id, 'Driver fee + gas', clock_timestamp());

  return query select true, r.cents, v_topup;
end;
$$;

-- Only the server (service role) may call it.
revoke all on function settle_ride(uuid, int, int, text) from public, anon, authenticated;
