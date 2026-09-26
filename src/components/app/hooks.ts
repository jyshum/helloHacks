"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEMO_MODE } from "@/lib/demo";
import type { LatLng } from "@/lib/geo";
import type { Role } from "@/lib/types";

export type PresenceUser = { user_id: string; role: Role; name: string; lat: number; lng: number };

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

// Shares my position on a Supabase presence channel and returns everyone else on it.
export function usePresence(
  channelName: string,
  me: { id: string; role: Role; full_name: string },
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

  useEffect(() => {
    if (DEMO_MODE) return;
    const supabase = createClient();
    const channel = supabase.channel(channelName, { config: { presence: { key: me.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceUser>();
        setOthers(
          Object.values(state)
            .map((entries) => entries[entries.length - 1])
            .filter((u) => !!u && u.user_id !== me.id) as PresenceUser[]
        );
      })
      .subscribe();
    channelRef.current = channel;

    const track = () => {
      const p = posRef.current;
      if (p && shareRef.current) channel.track({ user_id: me.id, role: me.role, name: me.full_name, lat: p.lat, lng: p.lng });
    };
    const t = setInterval(track, intervalMs);
    return () => {
      clearInterval(t);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelName, me.id, me.role, me.full_name, intervalMs]);

  // Push immediately when location arrives; stop sharing the moment share turns off.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    if (!share) ch.untrack();
    else if (myPos) ch.track({ user_id: me.id, role: me.role, name: me.full_name, lat: myPos.lat, lng: myPos.lng });
  }, [share, myPos, me.id, me.role, me.full_name]);

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
