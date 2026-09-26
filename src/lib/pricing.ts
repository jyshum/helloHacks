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
