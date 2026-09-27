"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useMap } from "@vis.gl/react-google-maps";
import type { LatLng } from "@/lib/geo";

// Renders any React content pinned to a map position (centred on it).
// Works with styled maps (no Map ID needed, unlike AdvancedMarker).
export default function MapOverlay({ position, zIndex = 1, children }: { position: LatLng; zIndex?: number; children: React.ReactNode }) {
  const map = useMap();
  const container = useMemo(() => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.transform = "translate(-50%, -50%)";
    return el;
  }, []);
  const pos = useRef(position);
  const overlay = useRef<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;
    class Pin extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayMouseTarget.appendChild(container);
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(pos.current.lat, pos.current.lng));
        if (!p) return;
        container.style.left = `${p.x}px`;
        container.style.top = `${p.y}px`;
      }
      onRemove() {
        container.remove();
      }
    }
    const o = new Pin();
    o.setMap(map);
    overlay.current = o;
    return () => {
      o.setMap(null);
      overlay.current = null;
    };
  }, [map, container]);

  useEffect(() => {
    pos.current = position;
    overlay.current?.draw();
  }, [position]);

  useEffect(() => {
    container.style.zIndex = String(zIndex);
  }, [zIndex, container]);

  return createPortal(children, container);
}
