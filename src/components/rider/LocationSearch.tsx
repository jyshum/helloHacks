"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, GraduationCap, LocateFixed, MapPin, MapPinned } from "lucide-react";
import { CAMPUS_SPOTS, PICKUP_SPOTS, type Place } from "@/lib/places";

type Field = "pickup" | "dropoff";

type Props = {
  pickup: Place | null;
  dropoff: Place | null;
  initialField: Field;
  myPos: { lat: number; lng: number } | null;
  onPick: (field: Field, place: Place) => void;
  onPinMode: (field: Field) => void;
  onClose: () => void;
};

type Suggestion = { key: string; main: string; secondary: string; icon: "place" | "campus"; place?: Place; placeId?: string };

// Full-screen "Where to?" panel with pickup + destination inputs.
export default function LocationSearch({ pickup, dropoff, initialField, myPos, onPick, onPinMode, onClose }: Props) {
  const [field, setField] = useState<Field>(initialField);
  const [text, setText] = useState({ pickup: pickup?.label ?? "", dropoff: dropoff?.label ?? "" });
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [placesOff, setPlacesOff] = useState(false);
  const dropRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (initialField === "dropoff" ? dropRef : pickRef).current?.focus();
  }, [initialField]);

  const query = text[field].trim();
  const isEditing = query.length >= 2 && query !== (field === "pickup" ? pickup?.label : dropoff?.label);

  // Places autocomplete (falls back quietly if the API isn't enabled).
  useEffect(() => {
    if (!isEditing || placesOff) return setRemote([]);
    const t = setTimeout(async () => {
      const res = await fetch("/api/places/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: query }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.unavailable) setPlacesOff(true);
      setRemote(
        (body.suggestions ?? []).map((s: { placeId: string; main: string; secondary: string }) => ({
          key: s.placeId,
          main: s.main,
          secondary: s.secondary,
          icon: "place" as const,
          placeId: s.placeId,
        }))
      );
    }, 250);
    return () => clearTimeout(t);
  }, [query, isEditing, placesOff]);

  const presets = (field === "dropoff" ? [...CAMPUS_SPOTS, ...PICKUP_SPOTS] : [...PICKUP_SPOTS, ...CAMPUS_SPOTS])
    .filter((p) => !isEditing || p.label.toLowerCase().includes(query.toLowerCase()))
    .map((p) => ({
      key: p.label,
      main: p.label,
      secondary: CAMPUS_SPOTS.includes(p) ? "UBC campus" : "Vancouver",
      icon: CAMPUS_SPOTS.includes(p) ? ("campus" as const) : ("place" as const),
      place: p,
    }));

  const suggestions: Suggestion[] = [...remote, ...presets].slice(0, 10);

  async function choose(s: Suggestion) {
    let place = s.place;
    if (!place && s.placeId) {
      const res = await fetch(`/api/places/details?id=${encodeURIComponent(s.placeId)}`);
      if (!res.ok) return;
      place = await res.json();
    }
    if (!place) return;
    setText((t) => ({ ...t, [field]: place!.label }));
    onPick(field, place);
    if (field === "pickup" && !dropoff) {
      setField("dropoff");
      dropRef.current?.focus();
    } else if (field === "dropoff" && !pickup) {
      setField("pickup");
      pickRef.current?.focus();
    }
  }

  function useCurrent() {
    if (!myPos) return alert("Allow location access in your browser to use this.");
    const place = { label: "Current location", ...myPos };
    setText((t) => ({ ...t, pickup: place.label }));
    onPick("pickup", place);
    if (!dropoff) {
      setField("dropoff");
      dropRef.current?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-app flex-col bg-white">
      <div className="flex items-center gap-3 px-4 pt-4">
        <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-paper" aria-label="Back">
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h2 className="font-heading text-lg font-bold text-ink">Plan your ride</h2>
      </div>

      <div className="mx-4 mt-3 flex gap-3 rounded-2xl bg-paper p-3">
        <div className="flex flex-col items-center pt-3.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink" />
          <span className="my-1 w-px flex-1 bg-muted/40" />
          <span className="h-2.5 w-2.5 bg-ink" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <input
            ref={pickRef}
            value={text.pickup}
            onFocus={() => setField("pickup")}
            onChange={(e) => setText((t) => ({ ...t, pickup: e.target.value }))}
            placeholder="Pickup location"
            className={`w-full rounded-xl px-3 py-2.5 text-[15px] outline-none ${field === "pickup" ? "bg-white ring-2 ring-ubc" : "bg-white/60"}`}
          />
          <input
            ref={dropRef}
            value={text.dropoff}
            onFocus={() => setField("dropoff")}
            onChange={(e) => setText((t) => ({ ...t, dropoff: e.target.value }))}
            placeholder="Where to?"
            className={`w-full rounded-xl px-3 py-2.5 text-[15px] outline-none ${field === "dropoff" ? "bg-white ring-2 ring-ubc" : "bg-white/60"}`}
          />
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto px-4 pb-6">
        {field === "pickup" && (
          <button onClick={useCurrent} className="row border-b border-line">
            <span className="row-icon bg-blue text-white"><LocateFixed size={18} aria-hidden /></span>
            <span>
              <span className="block font-medium text-ink">Current location</span>
              <span className="block text-sm text-muted">{myPos ? "Use GPS" : "Location not allowed yet"}</span>
            </span>
          </button>
        )}
        <button onClick={() => onPinMode(field)} className="row border-b border-line">
          <span className="row-icon"><MapPinned size={18} aria-hidden /></span>
          <span>
            <span className="block font-medium text-ink">Set location on map</span>
            <span className="block text-sm text-muted">Drag the map to place a pin</span>
          </span>
        </button>
        {suggestions.map((s) => (
          <button key={s.key} onClick={() => choose(s)} className="row border-b border-line">
            <span className="row-icon">{s.icon === "campus" ? <GraduationCap size={18} aria-hidden /> : <MapPin size={18} aria-hidden />}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{s.main}</span>
              <span className="block truncate text-sm text-muted">{s.secondary}</span>
            </span>
          </button>
        ))}
        {placesOff && isEditing && (
          <p className="pt-4 text-center text-xs text-muted">Address search is off. Pick a spot above or set it on the map.</p>
        )}
      </div>
    </div>
  );
}
