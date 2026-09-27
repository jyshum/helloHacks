import type { LatLng } from "@/lib/geo";

export type Place = { label: string } & LatLng;

// Preset spots so the demo doesn't need the Places API.
export const PICKUP_SPOTS: Place[] = [
  { label: "Kitsilano (W 4th & Vine)", lat: 49.2682, lng: -123.1566 },
  { label: "W 4th & Macdonald", lat: 49.2683, lng: -123.1752 },
  { label: "Broadway & Arbutus", lat: 49.2641, lng: -123.1605 },
  { label: "Broadway & Alma", lat: 49.2643, lng: -123.1856 },
  { label: "Point Grey Village", lat: 49.2645, lng: -123.2045 },
  { label: "Main & Broadway", lat: 49.2632, lng: -123.1007 },
  { label: "Cambie & Broadway", lat: 49.2635, lng: -123.114 },
  { label: "Dunbar & 41st", lat: 49.2345, lng: -123.1855 },
  { label: "SW Marine & Dunbar", lat: 49.2335, lng: -123.2105 },
  { label: "Kerrisdale (41st & West Blvd)", lat: 49.2341, lng: -123.1553 },
  { label: "Marpole (Granville & 70th)", lat: 49.2105, lng: -123.1405 },
  { label: "Downtown (Burrard Stn)", lat: 49.2856, lng: -123.1201 },
];

export const CAMPUS_SPOTS: Place[] = [
  { label: "UBC Bus Exchange", lat: 49.2677, lng: -123.247 },
  { label: "Nest (AMS Student Nest)", lat: 49.2665, lng: -123.2497 },
  { label: "Irving K. Barber Library", lat: 49.2677, lng: -123.2527 },
  { label: "Life Sciences Centre", lat: 49.2623, lng: -123.2455 },
  { label: "Thunderbird Park", lat: 49.2567, lng: -123.2438 },
  { label: "Totem Park Residence", lat: 49.2604, lng: -123.2522 },
];

// Short campus names for tight UI ("Nest by 9:00am").
const SHORT: Record<string, string> = {
  "UBC Bus Exchange": "Bus Loop",
  "Nest (AMS Student Nest)": "Nest",
  "Irving K. Barber Library": "IKB",
  "Life Sciences Centre": "Life Sci",
  "Thunderbird Park": "Thunderbird",
  "Totem Park Residence": "Totem Park",
};
export function shortCampus(label: string | null | undefined): string {
  return (label && SHORT[label]) || label || "UBC";
}
