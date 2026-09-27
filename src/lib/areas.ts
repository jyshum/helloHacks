import { haversineKm, type LatLng } from "@/lib/geo";

// Rough neighbourhood centres. We show people's area, never their address.
const AREAS: { name: string; lat: number; lng: number }[] = [
  { name: "UBC / Wesbrook", lat: 49.2606, lng: -123.2460 },
  { name: "Point Grey", lat: 49.2660, lng: -123.2000 },
  { name: "Kitsilano", lat: 49.2680, lng: -123.1600 },
  { name: "Dunbar", lat: 49.2490, lng: -123.1850 },
  { name: "Kerrisdale", lat: 49.2340, lng: -123.1560 },
  { name: "Arbutus Ridge", lat: 49.2470, lng: -123.1600 },
  { name: "Shaughnessy", lat: 49.2470, lng: -123.1380 },
  { name: "Fairview", lat: 49.2640, lng: -123.1300 },
  { name: "Downtown", lat: 49.2830, lng: -123.1180 },
  { name: "West End", lat: 49.2870, lng: -123.1360 },
  { name: "Mount Pleasant", lat: 49.2630, lng: -123.1000 },
  { name: "Oakridge", lat: 49.2290, lng: -123.1170 },
  { name: "Marpole", lat: 49.2110, lng: -123.1300 },
  { name: "Sunset", lat: 49.2200, lng: -123.0900 },
  { name: "Kensington", lat: 49.2440, lng: -123.0750 },
  { name: "Commercial Drive", lat: 49.2700, lng: -123.0690 },
  { name: "Hastings-Sunrise", lat: 49.2800, lng: -123.0420 },
  { name: "Killarney", lat: 49.2200, lng: -123.0400 },
  { name: "Richmond Centre", lat: 49.1680, lng: -123.1370 },
  { name: "Steveston", lat: 49.1300, lng: -123.1800 },
  { name: "East Richmond", lat: 49.1750, lng: -123.0800 },
  { name: "Metrotown", lat: 49.2260, lng: -123.0030 },
  { name: "Brentwood", lat: 49.2660, lng: -123.0010 },
  { name: "Burnaby Heights", lat: 49.2830, lng: -123.0100 },
  { name: "Edmonds", lat: 49.2120, lng: -122.9590 },
  { name: "New Westminster", lat: 49.2060, lng: -122.9110 },
  { name: "Coquitlam", lat: 49.2840, lng: -122.7930 },
  { name: "Port Moody", lat: 49.2830, lng: -122.8320 },
  { name: "Surrey Central", lat: 49.1890, lng: -122.8490 },
  { name: "North Vancouver", lat: 49.3200, lng: -123.0720 },
  { name: "West Vancouver", lat: 49.3280, lng: -123.1600 },
  { name: "Delta", lat: 49.0850, lng: -123.0580 },
];

export function nearestArea(p: LatLng): string {
  let best = { name: "Metro Vancouver", km: Infinity };
  for (const a of AREAS) {
    const km = haversineKm(p, a);
    if (km < best.km) best = { name: a.name, km };
  }
  return best.km <= 6 ? best.name : "Metro Vancouver";
}
