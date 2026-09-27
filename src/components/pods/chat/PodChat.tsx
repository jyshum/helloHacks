"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Ellipsis, Flag, MessageCircle, RotateCw, SendHorizontal, X } from "lucide-react";
import BackButton from "@/components/app/BackButton";
import Avatar from "@/components/Avatar";
import EnableNotifications from "@/components/pods/EnableNotifications";
import { createClient } from "@/lib/supabase/client";
import type { PodMessage } from "@/lib/pods/types";
import { MAX_MESSAGE_LENGTH, type ChatMember, type ChatMessage, type ChatPerson, type ChatState } from "./types";

type Local = ChatMessage & { tempId?: string; failed?: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;
const LONG_PRESS_MS = 500;
const REASONS = ["Harassment or bullying", "Inappropriate or offensive", "Spam", "Safety concern", "Something else"];

export default function PodChat({ podId, me }: { podId: string; me: ChatPerson }) {
  const [messages, setMessages] = useState<Local[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [reporting, setReporting] = useState<Local | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const firstScroll = useRef(true);
  const membersRef = useRef<Map<string, ChatMember>>(new Map());

  useEffect(() => {
    membersRef.current = new Map(members.map((m) => [m.id, m]));
  }, [members]);

  // Server state replaces confirmed messages; unsent local ones are kept at the end.
  const load = useCallback(async () => {
    const res = await fetch(`/api/pods/${podId}/messages`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(body.error ?? "Couldn't load the chat.");
      setLoaded(true);
      return;
    }
    const state = body as ChatState;
    setMembers(state.members);
    setCanPost(state.canPost);
    setMessages((prev) => [...state.messages, ...prev.filter((m) => m.tempId)]);
    setLoadError(null);
    setLoaded(true);
  }, [podId]);

  // Live inserts from Supabase Realtime (RLS limits delivery to pod members).
  useEffect(() => {
    load();
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Hand Realtime the user's token before joining; otherwise it joins as anon and
    // RLS (members-only) filters out every message.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = subscribe();
    });

    const subscribe = () => supabase
      .channel(`pod-chat-${podId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pod_messages", filter: `pod_id=eq.${podId}` },
        (payload) => {
          const row = payload.new as PodMessage;
          const sender = row.user_id ? membersRef.current.get(row.user_id) : undefined;
          if (row.user_id && !sender) {
            load(); // someone new joined: refresh to get their name and photo
            return;
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            let next = prev;
            if (row.user_id === me.id) {
              const i = prev.findIndex((m) => m.tempId && !m.failed && m.body === row.body);
              if (i >= 0) next = [...prev.slice(0, i), ...prev.slice(i + 1)];
            }
            return [...next, { ...row, sender: sender ? { id: sender.id, full_name: sender.full_name, photo_url: sender.photo_url } : null }];
          });
        }
      )
      // Deletes can't be filtered by pod, but only ids we already show are removed.
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pod_messages" }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (id) setMessages((prev) => prev.filter((m) => m.id !== id));
      })
      .subscribe((status) => {
        // After a reconnect, fill any gap from while we were offline.
        if (status === "SUBSCRIBED") load();
      });

    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [podId, me.id, load]);

  // Stick to the newest message unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages.length) return;
    const last = messages[messages.length - 1];
    if (firstScroll.current || atBottom.current || last.user_id === me.id) {
      el.scrollTo({ top: el.scrollHeight, behavior: firstScroll.current ? "auto" : "smooth" });
      firstScroll.current = false;
      setShowNew(false);
    } else {
      setShowNew(true);
    }
  }, [messages, me.id]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setShowNew(false);
  }

  function jumpToNewest() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  async function send(text: string, retryOf?: string) {
    const body = text.trim();
    if (!body || body.length > MAX_MESSAGE_LENGTH) return;
    const tempId = retryOf ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Local = {
      id: tempId,
      tempId,
      pod_id: podId,
      user_id: me.id,
      kind: "user",
      body,
      created_at: new Date().toISOString(),
      sender: me,
    };
    setMessages((prev) => (retryOf ? prev.map((m) => (m.tempId === retryOf ? optimistic : m)) : [...prev, optimistic]));
    if (!retryOf) {
      setDraft("");
      requestAnimationFrame(() => resizeInput());
    }

    const res = await fetch(`/api/pods/${podId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, failed: true } : m)));
      if (json.error) setToast(json.error);
      return;
    }
    const saved = json.message as ChatMessage;
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.tempId !== tempId);
      return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
    });
  }

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const others = members.filter((m) => m.id !== me.id);
  const subtitle = others.length ? others.map((m) => m.full_name.split(" ")[0]).join(", ") : "Just you so far";
  const roleOf = useMemo(() => new Map(members.map((m) => [m.id, m.role])), [members]);
  const tooLong = draft.length > MAX_MESSAGE_LENGTH;

  return (
    <main className="relative mx-auto flex h-[100dvh] w-full max-w-app flex-col">
      <header className="flex items-center gap-3 border-b border-white/60 bg-white/60 px-4 py-3 backdrop-blur-2xl backdrop-saturate-150">
        <BackButton className="shadow-none" />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-lg font-bold leading-tight text-ubc">Pod chat</h1>
          <p className="truncate text-xs text-muted">{loaded ? subtitle : "Loading…"}</p>
        </div>
        <div className="flex -space-x-2">
          {others.slice(0, 4).map((m) => (
            <Avatar key={m.id} name={m.full_name} photoUrl={m.photo_url} size={32} tone={m.role} />
          ))}
        </div>
      </header>
      <EnableNotifications variant="banner" />

      <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto px-4 py-4">
        {loadError ? (
          <div className="card mt-10 p-6 text-center">
            <p className="text-sm text-ink">{loadError}</p>
            <button onClick={load} className="btn-ghost mt-4 gap-2 px-4 py-2 text-sm">
              <RotateCw size={16} aria-hidden /> Try again
            </button>
          </div>
        ) : loaded && !messages.length ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-frost text-blue">
              <MessageCircle size={26} aria-hidden />
            </span>
            <p className="mt-3 font-heading font-semibold text-ink">Say hi to your pod</p>
            <p className="mt-1 max-w-[260px] text-sm text-muted">Sort out pickup spots and timing here. Pod updates show up in this chat too.</p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
              const startsGroup =
                newDay ||
                prev.kind === "system" ||
                prev.user_id !== m.user_id ||
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_GAP_MS;
              return (
                <li key={m.tempId ?? m.id}>
                  {newDay && <DayDivider iso={m.created_at} />}
                  {m.kind === "system" ? (
                    <p className="my-2 px-6 text-center text-xs text-muted">{m.body}</p>
                  ) : (
                    <Bubble
                      m={m}
                      mine={m.user_id === me.id}
                      startsGroup={startsGroup}
                      tone={(m.user_id && roleOf.get(m.user_id)) || "rider"}
                      onReport={() => setReporting(m)}
                      onRetry={() => send(m.body, m.tempId)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {showNew && (
        <button
          onClick={jumpToNewest}
          className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ubc px-4 py-2 text-sm font-semibold text-white shadow-lift"
        >
          <ArrowDown size={16} aria-hidden /> New messages
        </button>
      )}

      <footer className="border-t border-white/60 bg-white/60 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-2xl backdrop-saturate-150">
        {loaded && !loadError && !canPost ? (
          <p className="py-2 text-center text-sm text-muted">You can chat once the driver approves you.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                resizeInput();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              placeholder="Message your pod"
              aria-label="Message"
              disabled={!loaded}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-paper px-4 py-2.5 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30"
            />
            <button
              type="submit"
              disabled={!draft.trim() || tooLong || !loaded}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ubc text-white transition active:scale-95 disabled:opacity-40"
              aria-label="Send"
            >
              <SendHorizontal size={20} aria-hidden />
            </button>
          </form>
        )}
        {draft.length > MAX_MESSAGE_LENGTH - 200 && (
          <p className={`mt-1 text-right text-xs ${tooLong ? "text-red-700" : "text-muted"}`}>
            {draft.length}/{MAX_MESSAGE_LENGTH}
          </p>
        )}
      </footer>

      {reporting && (
        <ReportSheet
          podId={podId}
          message={reporting}
          onClose={() => setReporting(null)}
          onDone={() => {
            setReporting(null);
            setToast("Thanks. The hoppedIn team will review this message.");
          }}
        />
      )}

      {toast && (
        <div role="status" className="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lift">
          {toast}
        </div>
      )}
    </main>
  );
}

function Bubble({
  m,
  mine,
  startsGroup,
  tone,
  onReport,
  onRetry,
}: {
  m: Local;
  mine: boolean;
  startsGroup: boolean;
  tone: "driver" | "rider";
  onReport: () => void;
  onRetry: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => timer.current && clearTimeout(timer.current);
  const canReport = !mine && !m.tempId;
  const pressHandlers = canReport
    ? {
        onPointerDown: () => {
          cancel();
          timer.current = setTimeout(onReport, LONG_PRESS_MS);
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          onReport();
        },
      }
    : {};

  return (
    <div className={`group flex items-end gap-2 ${mine ? "justify-end" : ""} ${startsGroup ? "mt-3" : "mt-0.5"}`}>
      {!mine && (
        <div className="w-8 shrink-0">{startsGroup && <Avatar name={m.sender?.full_name} photoUrl={m.sender?.photo_url} size={32} tone={tone} />}</div>
      )}
      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {startsGroup && (
          <p className="mb-0.5 px-1 text-[11px] text-muted">
            {!mine && <span className="font-semibold text-ink">{m.sender?.full_name.split(" ")[0] ?? "Former member"} </span>}
            {formatTime(m.created_at)}
          </p>
        )}
        <div className="flex items-center gap-1">
          <p
            {...pressHandlers}
            className={`select-text whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
              m.failed
                ? "rounded-br-md bg-red-600 text-white"
                : mine
                  ? `rounded-br-md bg-ubc text-white ${m.tempId ? "opacity-70" : ""}`
                  : "rounded-bl-md border border-line bg-white text-ink"
            }`}
          >
            {m.body}
          </p>
          {canReport && (
            <button
              onClick={onReport}
              className="rounded-full p-1 text-muted opacity-0 transition hover:bg-white focus:opacity-100 group-hover:opacity-100"
              aria-label="Message options"
            >
              <Ellipsis size={16} aria-hidden />
            </button>
          )}
        </div>
        {m.failed && (
          <button onClick={onRetry} className="mt-0.5 flex items-center gap-1 px-1 text-xs font-semibold text-red-700">
            <RotateCw size={12} aria-hidden /> Not sent. Tap to retry
          </button>
        )}
      </div>
    </div>
  );
}

function ReportSheet({ podId, message, onClose, onDone }: { podId: string; message: Local; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const full = reason === "Something else" ? details.trim() || reason : details.trim() ? `${reason}: ${details.trim()}` : reason;
    const res = await fetch(`/api/pods/${podId}/messages/${message.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: full }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't send the report.");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/40" onClick={onClose}>
      <div className="sheet static w-full" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Report message">
        <div className="sheet-handle" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-ink">
              <Flag size={18} className="text-red-600" aria-hidden /> Report message
            </h2>
            <p className="mt-1 text-sm text-muted">Only the hoppedIn team sees reports. {message.sender?.full_name.split(" ")[0] ?? "They"} won&apos;t be told who reported.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper" aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>

        <blockquote className="mt-3 line-clamp-3 rounded-xl bg-paper px-3 py-2 text-sm text-ink">{message.body}</blockquote>

        <div className="mt-3 flex flex-col gap-1.5" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={`rounded-xl border px-3 py-2.5 text-left text-sm ${reason === r ? "border-ubc bg-frost font-semibold text-ubc" : "border-line text-ink"}`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason && (
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 400))}
            placeholder={reason === "Something else" ? "What happened?" : "Add details (optional)"}
            rows={2}
            className="input mt-3 resize-none text-sm"
          />
        )}
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button onClick={submit} disabled={!reason || busy} className="btn mt-4 w-full bg-red-600 text-white">
          {busy ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}

function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{dayLabel(iso)}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
