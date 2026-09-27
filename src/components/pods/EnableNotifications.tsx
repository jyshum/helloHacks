"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Share, SquarePlus, X } from "lucide-react";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

const DISMISS_KEY = "hoppedin-notif-banner-dismissed";

// Turns on web push for this browser. `card` for the pod screen; `banner` is a slim,
// dismissible prompt that hides itself once notifications are on.
export default function EnableNotifications({ variant = "card" }: { variant?: "card" | "banner" }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {}
    if (isIos() && !isStandalone()) return setState("ios-install");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !VAPID_KEY) {
      return setState("unsupported");
    }
    if (Notification.permission === "denied") return setState("denied");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      await save(sub); // re-sync in case the server copy was removed
      return setState("on");
    }
    setState("off");
  }, []);

  useEffect(() => {
    check().catch(() => setState("unsupported"));
  }, [check]);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) }));
      await save(sub);
      setState("on");
    } catch (e) {
      setError((e as Error).message || "Couldn't turn on notifications.");
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  if (variant === "banner") {
    if (dismissed || !["off", "ios-install", "busy"].includes(state)) return null;
    return (
      <div className="flex items-center gap-3 border-b border-line bg-frost px-4 py-2.5 text-sm">
        <Bell size={18} className="shrink-0 text-blue" aria-hidden />
        <p className="min-w-0 flex-1 text-ink">
          {state === "ios-install" ? "Add Hopped to your Home Screen to get pod alerts." : "Get alerts for new messages and pickups."}
        </p>
        {state !== "ios-install" && (
          <button onClick={enable} disabled={state === "busy"} className="shrink-0 font-semibold text-blue">
            {state === "busy" ? "Turning on…" : "Turn on"}
          </button>
        )}
        <button onClick={dismiss} className="shrink-0 rounded-full p-1 text-muted hover:bg-white" aria-label="Dismiss">
          <X size={16} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="row-icon">{state === "on" ? <Bell size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-heading font-semibold text-ink">{state === "on" ? "Notifications on" : "Pod notifications"}</p>
          <p className="mt-0.5 text-sm text-muted">{DESCRIPTION[state]}</p>
        </div>
      </div>

      {state === "ios-install" && (
        <ol className="mt-3 flex flex-col gap-2 rounded-xl bg-paper p-3 text-sm text-ink">
          <li className="flex items-center gap-2">
            <Step n={1} /> Tap <Share size={16} className="text-blue" aria-label="Share" /> Share in Safari
          </li>
          <li className="flex items-center gap-2">
            <Step n={2} /> Choose <SquarePlus size={16} className="text-blue" aria-hidden /> Add to Home Screen
          </li>
          <li className="flex items-center gap-2">
            <Step n={3} /> Open Hopped from your Home Screen and turn notifications on
          </li>
        </ol>
      )}

      {(state === "off" || state === "busy") && (
        <button onClick={enable} disabled={state === "busy"} className="btn-ubc mt-3 w-full gap-2">
          <Bell size={18} aria-hidden /> {state === "busy" ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {state === "on" && (
        <button onClick={disable} className="btn-ghost mt-3 w-full text-sm">
          Turn off on this device
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

const DESCRIPTION: Record<State, string> = {
  loading: "Checking this device…",
  busy: "Asking your browser…",
  off: "Get a heads-up when your driver confirms, runs late, or your pod sends a message.",
  on: "You'll get pod updates on this device.",
  denied: "Notifications are blocked. Allow them for this site in your browser settings, then reload.",
  "ios-install": "On iPhone, notifications only work after adding Hopped to your Home Screen.",
  unsupported: "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.",
};

function Step({ n }: { n: number }) {
  return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ubc text-[11px] font-bold text-white">{n}</span>;
}

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

async function save(sub: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save the subscription.");
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
