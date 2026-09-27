// SHARED CONTRACT: Partner A calls notify(); Partner B implements delivery
// (web push first, email fallback). Until then this only logs.

export type NoticeKind =
  | "pod_invite" // you've been matched into a pod
  | "pod_request" // (driver) a rider asked to join
  | "pod_approved" // (rider) the driver approved you
  | "pod_declined"
  | "trip_confirm_ask" // (driver) night-before "driving tomorrow?"
  | "trip_confirmed" // (riders) driver confirmed tomorrow
  | "trip_cancelled" // (riders) driver can't drive
  | "driver_late" // (riders) driver hasn't left yet
  | "driver_missed" // (riders) looks like driver isn't coming
  | "chat"; // new pod chat message

export type Notice = {
  kind: NoticeKind;
  title: string;
  body: string;
  url: string; // in-app path to open, e.g. /pods/<id>
};

// Server-only. userIds are users.id (not auth ids). Must never throw.
export async function notify(userIds: string[], notice: Notice): Promise<void> {
  if (!userIds.length) return;
  console.log(`[notify] ${notice.kind} → ${userIds.length} user(s): ${notice.title}`);
}
