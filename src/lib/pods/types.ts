// SHARED CONTRACT for commute pods (mirrors supabase/migrations/20260929000000_commute_pods.sql).
// Partner A owns matching/pods, Partner B owns chat/notifications. Add fields freely;
// don't rename or remove without telling the other side.

export type CommuteMode = "driver" | "rider";
export type Weekday = 1 | 2 | 3 | 4 | 5; // Mon..Fri

export interface CommuteProfile {
  user_id: string;
  mode: CommuteMode;
  home_lat: number;
  home_lng: number;
  home_area: string | null; // neighbourhood only, never the address
  campus_lat: number;
  campus_lng: number;
  campus_label: string;
  days: Weekday[];
  arrive_by: string; // "HH:MM:SS"
  day_times: Partial<Record<Weekday, string>>;
  home_leave_at: string | null; // driver: when they usually leave campus (null = no ride home)
  home_day_times: Partial<Record<Weekday, string>>;
  seats: number;
  active: boolean;
}

export interface Pod {
  id: string;
  driver_id: string;
  campus_lat: number;
  campus_lng: number;
  campus_label: string;
  status: "active" | "paused" | "archived";
  paused_at?: string | null; // set while the driver has paused driving
  created_at: string;
}

export type PodMemberStatus = "invited" | "requested" | "active" | "declined" | "left";

export interface PodMember {
  id: string;
  pod_id: string;
  user_id: string;
  role: CommuteMode;
  status: PodMemberStatus;
  days: Weekday[];
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_label: string | null;
  pickup_time: string | null;
  detour_minutes: number | null;
  drive_minutes: number | null;
  transit_minutes: number | null;
  score: number | null;
}

export interface PodMessage {
  id: string;
  pod_id: string;
  user_id: string | null; // null = system message
  kind: "user" | "system";
  body: string;
  created_at: string;
}

export type PodTripStatus = "scheduled" | "confirmed" | "cancelled" | "live" | "completed" | "missed";

export interface PodTrip {
  id: string;
  pod_id: string;
  trip_date: string; // YYYY-MM-DD
  status: PodTripStatus;
  ride_id: string | null; // links to rides → reuse /match live trip screen
  confirmed_at: string | null;
}

export const WEEKDAY_LABELS: Record<Weekday, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri" };
