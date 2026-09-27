"use client";

import { Map, Marker, Polyline, useApiIsLoaded, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { UBC_MAP_STYLE } from "@/lib/mapStyle";
import { UBC, type LatLng } from "@/lib/geo";
import { DRIVER_ICON, RIDER_ICON, SELF_ICON } from "@/components/map/markers";
import MapOverlay from "./MapOverlay";
import AvatarPin from "./AvatarPin";

export type MapCar = { id: string; pos: LatLng; name?: string; photo?: string | null; live?: boolean; onClick?: () => void };
export type MapPin = { id: string; pos: LatLng; kind: "rider" | "pickup" | "dropoff"; name?: string; photo?: string | null; onClick?: () => void };

function icon(url: string, w: number, h: number, ax: number, ay: number): google.maps.Icon {
  return { url, scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(ax, ay) };
}

const PICKUP_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="#0B1B2E" stroke="#fff" stroke-width="3"/><circle cx="14" cy="14" r="3.5" fill="#fff"/></svg>`
)}`;
const DROPOFF_ICON = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><rect x="3" y="3" width="20" height="20" rx="3" fill="#0B1B2E" stroke="#fff" stroke-width="3"/><rect x="10" y="10" width="6" height="6" fill="#fff"/></svg>`
)}`;

type Props = {
  me?: LatLng | null;
  cars?: MapCar[];
  pins?: MapPin[];
  routes?: { id: string; path: LatLng[]; color?: string; opacity?: number; weight?: number }[];
  fit?: LatLng[] | null; // fit camera to these points when they change
  bottomPadding?: number; // px hidden behind the bottom sheet
  children?: React.ReactNode;
};

export default function BaseMap({ me, cars = [], pins = [], routes = [], fit, bottomPadding = 280, children }: Props) {
  const loaded = useApiIsLoaded();
  return (
    <Map
      defaultCenter={UBC}
      defaultZoom={14}
      styles={UBC_MAP_STYLE}
      disableDefaultUI
      gestureHandling="greedy"
      clickableIcons={false}
      className="absolute inset-0"
    >
      {loaded && (
        <>
          {routes.map((r) => (
            <Polyline
              key={r.id}
              path={r.path}
              strokeColor={r.color ?? "#002145"}
              strokeOpacity={r.opacity ?? 0.35}
              strokeWeight={r.weight ?? 4}
            />
          ))}
          {pins
            .filter((p) => p.kind === "rider" && p.name)
            .map((p) => (
              <MapOverlay key={p.id} position={p.pos} zIndex={50}>
                <AvatarPin name={p.name!} photo={p.photo} kind="rider" size={34} onClick={p.onClick} />
              </MapOverlay>
            ))}
          {pins.filter((p) => !(p.kind === "rider" && p.name)).map((p) => (
            <Marker
              key={p.id}
              position={p.pos}
              onClick={p.onClick}
              zIndex={p.kind === "rider" ? 1 : 500}
              icon={
                p.kind === "rider"
                  ? icon(RIDER_ICON, 30, 40, 15, 38)
                  : p.kind === "pickup"
                    ? icon(PICKUP_ICON, 28, 28, 14, 14)
                    : icon(DROPOFF_ICON, 26, 26, 13, 13)
              }
            />
          ))}
          {cars.map((c) =>
            c.name ? (
              <MapOverlay key={c.id} position={c.pos} zIndex={100}>
                <AvatarPin name={c.name} photo={c.photo} kind="driver" live={c.live} onClick={c.onClick} />
              </MapOverlay>
            ) : (
              <Marker key={c.id} position={c.pos} onClick={c.onClick} zIndex={100} icon={icon(DRIVER_ICON, 40, 40, 20, 20)} />
            )
          )}
          {me && <Marker position={me} zIndex={1000} icon={icon(SELF_ICON, 36, 36, 18, 18)} />}
          <CameraFit points={fit} bottomPadding={bottomPadding} />
        </>
      )}
      {children}
    </Map>
  );
}

// Re-centres the camera when the given point set changes.
function CameraFit({ points, bottomPadding }: { points?: LatLng[] | null; bottomPadding: number }) {
  const map = useMap();
  const key = points?.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    if (!map || !points?.length) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(15);
      return;
    }
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, { top: 110, left: 50, right: 50, bottom: bottomPadding + 30 });
    // Points right next to each other (e.g. driver at the pickup) would zoom in too far.
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, bottomPadding]);
  return null;
}
