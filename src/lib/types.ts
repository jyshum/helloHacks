// FROZEN CONTRACT. Everything imports from here. Do not change shapes without telling the team.

export type Role = "driver" | "rider" | "both";
export type ChatPreference = "chatty" | "quiet" | "no_preference";

export interface User {
  id: string;
  ubc_email: string;
  email_verified: boolean;
  full_name: string;
  faculty: string | null;
  year: number | null;
  photo_url: string | null;
  role: Role;
  rating_avg: number;
  rating_count: number;
  chat_preference: ChatPreference;
  license_verified?: boolean; // Phase 6
}

export interface Vehicle {
  id: string;
  user_id: string;
  make_model: string;
  license_plate: string;
  province: string;
  color: string;
  seat_capacity: number;
  is_ev: boolean;
  photo_url?: string | null; // car photo with plate visible
}

export interface Ride {
  id: string;
  driver_id: string;
  origin_lat: number; origin_lng: number; origin_label: string;
  destination_lat: number; destination_lng: number; destination_label: string;
  departure_time: string;
  seats_available: number;
  status: "posted" | "active" | "completed" | "cancelled";
}

export interface RideRequest {
  id: string;
  ride_id: string;
  rider_id: string;
  pickup_lat: number; pickup_lng: number; pickup_label: string;
  dropoff_lat: number; dropoff_lng: number; dropoff_label: string;
  detour_minutes: number | null;
  detour_km: number | null;
  estimated_cost_cents: number | null;
  status: "pending" | "accepted" | "declined" | "completed" | "cancelled";
}

export interface Rating {
  id: string;
  ride_id: string;
  rater_id: string;
  ratee_id: string;
  score: number;
  comment: string | null;
}

// Manual driver-license review by the Hopped team.
export interface LicenseReview {
  id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
}
