import { haversineKm, type LatLng } from "@/lib/geo";

// "Gas contribution", never "fare": riders chip in for fuel, drivers don't profit
// (BC Passenger Transportation Act s.55 cost-share framing).
export const BASE_CENTS = 200;
export const PER_KM_CENTS = 45;
export const CAP_CENTS = 1500;

export function calculateGasContribution(detourKm: number): number {
  const raw = BASE_CENTS + Math.max(0, detourKm) * PER_KM_CENTS;
  const rounded = Math.round(raw / 5) * 5;
  return Math.min(rounded, CAP_CENTS);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const PRICING_FORMULA = `$${(BASE_CENTS / 100).toFixed(2)} base + $${(PER_KM_CENTS / 100).toFixed(2)}/km of detour, capped at $${(CAP_CENTS / 100).toFixed(2)}`;

// Pod rides: the driver was going to campus anyway, so riders just chip in for the fuel of their
// part of the drive. $1 + 15¢/km (≈ BC gas per km), rounded to 5¢. Cheaper than a bus fare.
export const POD_BASE_CENTS = 100;
export const POD_PER_KM_CENTS = 15;
export const POD_CAP_CENTS = 600;

export function podShareCents(rideKm: number): number {
  const raw = POD_BASE_CENTS + Math.max(0, rideKm) * POD_PER_KM_CENTS;
  return Math.min(Math.round(raw / 5) * 5, POD_CAP_CENTS);
}

// Road distance ≈ 1.3 × straight line in Vancouver's grid.
export function podShareFor(pickup: LatLng, campus: LatLng): number {
  return podShareCents(haversineKm(pickup, campus) * 1.3);
}
