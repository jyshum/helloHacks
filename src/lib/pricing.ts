import { haversineKm, type LatLng } from "@/lib/geo";

// Ride price, per rider per ride: driver fee + company fee + gas by distance, then 5% tax.
// The driver gets the driver fee and the gas; Hopped keeps the company fee; tax is remitted.
export const DRIVER_FEE_CENTS = 500;
export const COMPANY_FEE_CENTS = 200;
export const GAS_PER_KM_CENTS = 15;
export const TAX_RATE = 0.05;

export const PRICING_FORMULA = "$5 driver + $2 company + 15¢/km gas + 5% tax";

export type Fare = { km: number; driver: number; company: number; gas: number; tax: number; total: number };

export function fareFor(km: number): Fare {
  const d = Math.max(0, Math.round(km * 10) / 10);
  const gas = Math.round(d * GAS_PER_KM_CENTS);
  const subtotal = DRIVER_FEE_CENTS + COMPANY_FEE_CENTS + gas;
  const tax = Math.round(subtotal * TAX_RATE);
  return { km: d, driver: DRIVER_FEE_CENTS, company: COMPANY_FEE_CENTS, gas, tax, total: subtotal + tax };
}

// Road distance ≈ 1.3 × straight line in Vancouver's grid.
export function fareBetween(pickup: LatLng, dropoff: LatLng): Fare {
  return fareFor(haversineKm(pickup, dropoff) * 1.3);
}

// What the driver receives from a ride's total (driver fee + gas).
export function driverShareOf(totalCents: number): number {
  return Math.max(0, Math.round(totalCents / (1 + TAX_RATE)) - COMPANY_FEE_CENTS);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
