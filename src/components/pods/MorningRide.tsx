"use client";

import { Car } from "lucide-react";
import InOut from "@/components/pods/InOut";
import { arriveOn, nextDateOn, pickupOn, prettyDate, prettyTime } from "@/lib/pods/time";
import type { Weekday } from "@/lib/pods/types";
import type { PodView } from "@/lib/pods/load";

// A rider's ride to campus on the selected weekday (its next date): in by default,
// "Don't need a ride" skips just that date and lets the driver know.
export default function MorningRide({
  view,
  day,
  busy,
  call,
}: {
  view: PodView;
  day: number;
  busy: boolean;
  call: (url: string, body?: object, method?: string) => Promise<unknown>;
}) {
  const { pod, driverProfile, nextTrip, skips } = view;
  const mine = view.me!;
  if (view.paused || !(mine.days as number[]).includes(day)) return null;

  const date = nextDateOn([day as Weekday], arriveOn(driverProfile, day as Weekday) + 30)!;
  const skipping = skips.some((s) => s.user_id === mine.user_id && s.trip_date === date);
  const pickup = pickupOn(mine.pickup_time, driverProfile, mine.days as number[], day);
  // Once that day's trip is under way (or over), the choice is locked.
  const locked = nextTrip?.date === date && ["live", "completed", "missed", "cancelled"].includes(nextTrip.status);

  return (
    <div className="card mt-4 p-4">
      <div className="flex items-center gap-3">
        <span className="row-icon"><Car size={18} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">Ride to campus · {prettyTime(pickup)}</span>
          <span className="block truncate text-[13px] text-muted">
            {prettyDate(date)} · {skipping ? "you're skipping" : mine.pickup_label ?? "pickup"}
          </span>
        </span>
      </div>
      {!locked && (
        <InOut isIn={!skipping} busy={busy} onChange={(isIn) => call(`/api/pods/${pod.id}/skip`, { date }, isIn ? "DELETE" : "POST")} />
      )}
    </div>
  );
}
