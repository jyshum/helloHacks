"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_MODE } from "@/lib/demo";
import type { LatLng } from "@/lib/geo";
import type { Role } from "@/lib/types";

export type PresenceUser = { user_id: string; role: Role; name: string; photo?: string | null; lat: number; lng: number };

// Live browser location. null until the user allows it.
export function useMyLocation(): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return pos;
}

// Live positions of everyone on a channel (drivers on the map, everyone on a ride).
// Positions go over Supabase broadcast, not presence: presence only allows a handful of
// updates per 30 s per client, which froze moving cars. Each client sends its position at
// most once a second, plus a heartbeat every `intervalMs`; anyone silent for STALE_MS drops off.
const MIN_PUSH_MS = 1000;
const STALE_MS = 15000;

export function usePresence(
  channelName: string,
  me: { id: string; role: Role; full_name: string; photo_url?: string | null },
  myPos: LatLng | null,
  intervalMs = 3000,
  share = true // false = watch others without broadcasting my own position
): PresenceUser[] {
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const posRef = useRef(myPos);
  posRef.current = myPos;
  const shareRef = useRef(share);
  shareRef.current = share;
  const lastPush = useRef(0);
  const meRef = useRef(me);
  meRef.current = me;

  const push = () => {
    const ch = channelRef.current;
    const p = posRef.current;
    if (!ch || !p || !shareRef.current) return;
    lastPush.current = Date.now();
    const m = meRef.current;
    void ch.send({ type: "broadcast", event: "pos", payload: { user_id: m.id, role: m.role, name: m.full_name, photo: m.photo_url ?? null, lat: p.lat, lng: p.lng } });
  };

  useEffect(() => {
    if (DEMO_MODE) return;
    const supabase = createClient();
    const seen = new Map<string, { u: PresenceUser; at: number }>();
    const publish = () => setOthers(Array.from(seen.values()).map((x) => x.u));
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        const u = payload as PresenceUser;
        if (!u?.user_id || u.user_id === me.id) return;
        seen.set(u.user_id, { u, at: Date.now() });
        publish();
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        if (seen.delete((payload as { user_id: string }).user_id)) publish();
      })
      .subscribe((status) => status === "SUBSCRIBED" && push());
    channelRef.current = channel;

    const beat = setInterval(push, intervalMs);
    const prune = setInterval(() => {
      let changed = false;
      for (const [id, x] of Array.from(seen)) if (Date.now() - x.at > STALE_MS) changed = seen.delete(id) || changed;
      if (changed) publish();
    }, 5000);
    return () => {
      clearInterval(beat);
      clearInterval(prune);
      void channel.send({ type: "broadcast", event: "leave", payload: { user_id: me.id } });
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, me.id, intervalMs]);

  // Send right away when I move (throttled); say goodbye the moment sharing turns off.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    if (!share) void ch.send({ type: "broadcast", event: "leave", payload: { user_id: me.id } });
    else if (myPos && Date.now() - lastPush.current >= MIN_PUSH_MS) push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, myPos?.lat, myPos?.lng]);

  return others;
}

// Increments every `ms`. Drives simulated driver movement.
export function useTick(ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}
