import type { LatLng } from "@/lib/geo";

// When true, the map serves hardcoded routes + markers instead of hitting
// Supabase or the Directions API. Keeps the demo alive if venue wifi drops.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export type MapDriver = {
  id: string; // ride id
  driverId: string;
  name: string;
  faculty: string | null;
  photo?: string | null;
  originLabel: string;
  destinationLabel: string;
  origin: LatLng;
  destination: LatLng;
  seats: number;
  path?: LatLng[]; // pre-computed route, if known
};

export type MapRider = {
  id: string; // request id
  riderId: string;
  name: string;
  faculty: string | null;
  photo?: string | null;
  pickup: LatLng;
  pickupLabel: string;
};

export const DEMO_DRIVERS: MapDriver[] = [
  {
    id: "demo-ride-kits",
    driverId: "demo-driver-1",
    name: "Maya P.",
    faculty: "Applied Science",
    originLabel: "Kitsilano",
    destinationLabel: "UBC Bus Exchange",
    origin: { lat: 49.2682, lng: -123.1566 },
    destination: { lat: 49.2677, lng: -123.247 },
    seats: 3,
    path: [
      { lat: 49.2682, lng: -123.1566 },
      { lat: 49.2683, lng: -123.17 },
      { lat: 49.2683, lng: -123.1856 },
      { lat: 49.2684, lng: -123.2 },
      { lat: 49.2688, lng: -123.2155 },
      { lat: 49.2716, lng: -123.225 },
      { lat: 49.2712, lng: -123.2345 },
      { lat: 49.269, lng: -123.2425 },
      { lat: 49.2677, lng: -123.247 },
    ],
  },
  {
    id: "demo-ride-main",
    driverId: "demo-driver-2",
    name: "Jordan L.",
    faculty: "Sauder School of Business",
    originLabel: "Main & Broadway",
    destinationLabel: "UBC Bus Exchange",
    origin: { lat: 49.2632, lng: -123.1007 },
    destination: { lat: 49.2677, lng: -123.247 },
    seats: 2,
    path: [
      { lat: 49.2632, lng: -123.1007 },
      { lat: 49.2635, lng: -123.114 },
      { lat: 49.2638, lng: -123.1386 },
      { lat: 49.2641, lng: -123.155 },
      { lat: 49.2643, lng: -123.1856 },
      { lat: 49.2645, lng: -123.2 },
      { lat: 49.2642, lng: -123.2155 },
      { lat: 49.2655, lng: -123.23 },
      { lat: 49.267, lng: -123.242 },
      { lat: 49.2677, lng: -123.247 },
    ],
  },
  {
    id: "demo-ride-marpole",
    driverId: "demo-driver-3",
    name: "Priya S.",
    faculty: "Science",
    originLabel: "Marpole",
    destinationLabel: "UBC Bus Exchange",
    origin: { lat: 49.2105, lng: -123.13 },
    destination: { lat: 49.2677, lng: -123.247 },
    seats: 3,
    path: [
      { lat: 49.2105, lng: -123.13 },
      { lat: 49.2118, lng: -123.145 },
      { lat: 49.2135, lng: -123.16 },
      { lat: 49.218, lng: -123.18 },
      { lat: 49.226, lng: -123.2 },
      { lat: 49.233, lng: -123.215 },
      { lat: 49.244, lng: -123.23 },
      { lat: 49.256, lng: -123.244 },
      { lat: 49.262, lng: -123.25 },
      { lat: 49.2677, lng: -123.247 },
    ],
  },
];

export const DEMO_RIDERS: MapRider[] = [
  { id: "demo-req-1", riderId: "demo-rider-1", name: "Sam K.", faculty: "Arts", pickup: { lat: 49.2683, lng: -123.1752 }, pickupLabel: "W 4th & Macdonald" },
  { id: "demo-req-2", riderId: "demo-rider-2", name: "Lena W.", faculty: "Science", pickup: { lat: 49.2641, lng: -123.1605 }, pickupLabel: "Broadway & Arbutus" },
  { id: "demo-req-3", riderId: "demo-rider-3", name: "Omar H.", faculty: "Kinesiology", pickup: { lat: 49.2335, lng: -123.2105 }, pickupLabel: "SW Marine & Dunbar" },
  { id: "demo-req-4", riderId: "demo-rider-4", name: "Chloe T.", faculty: "Forestry", pickup: { lat: 49.2645, lng: -123.2045 }, pickupLabel: "Point Grey Village" },
];
