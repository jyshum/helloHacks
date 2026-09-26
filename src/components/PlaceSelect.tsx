"use client";

import type { Place } from "@/lib/places";

type Props = {
  id: string;
  label: string;
  places: Place[];
  value: Place | null;
  onChange: (p: Place | null) => void;
  allowCurrentLocation?: boolean;
};

export default function PlaceSelect({ id, label, places, value, onChange, allowCurrentLocation }: Props) {
  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (p) => onChange({ label: "My current location", lat: p.coords.latitude, lng: p.coords.longitude }),
      () => alert("Couldn't get your location. Pick a spot from the list.")
    );
  }

  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="input"
        value={value?.label ?? ""}
        onChange={(e) => {
          if (e.target.value === "__me") return locateMe();
          onChange(places.find((p) => p.label === e.target.value) ?? null);
        }}
      >
        <option value="" disabled>Choose a spot</option>
        {allowCurrentLocation && <option value="__me">📍 Use my current location</option>}
        {value?.label === "My current location" && <option value="My current location">My current location</option>}
        {places.map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
      </select>
    </div>
  );
}
