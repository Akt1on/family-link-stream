// Lightweight offline cache for chats & messages.
// Uses localStorage with versioned keys and size-bounded entries.

import { useEffect, useState } from "react";

const PREFIX = "fam:offline:v1:";
const MAX_MESSAGES_PER_CHAT = 80;
const MAX_BYTES_PER_KEY = 350_000; // ~350 KB per entry

type SyncEvent = { key: string; at: number };
const listeners = new Set<(e: SyncEvent) => void>();

function safeSet(key: string, value: unknown) {
  try {
    const json = JSON.stringify(value);
    if (json.length > MAX_BYTES_PER_KEY) return;
    localStorage.setItem(PREFIX + key, json);
    const evt = { key, at: Date.now() };
    listeners.forEach((l) => l(evt));
    try { localStorage.setItem(PREFIX + "__last_sync", String(evt.at)); } catch {}
  } catch {
    // Quota or serialization error — ignore silently.
  }
}

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function cacheChats(userId: string, convs: unknown) {
  safeSet(`chats:${userId}`, convs);
}
export function getCachedChats<T = unknown>(userId: string): T | null {
  return safeGet<T>(`chats:${userId}`);
}

export function cacheMessages(convId: string, messages: any[]) {
  const trimmed = messages.slice(-MAX_MESSAGES_PER_CHAT);
  safeSet(`msgs:${convId}`, trimmed);
}
export function getCachedMessages<T = any>(convId: string): T[] | null {
  return safeGet<T[]>(`msgs:${convId}`);
}

export function cacheProfiles(profiles: unknown) {
  safeSet("profiles", profiles);
}
export function getCachedProfiles<T = unknown>(): T | null {
  return safeGet<T>("profiles");
}

export function getLastSyncAt(): number | null {
  try {
    const v = localStorage.getItem(PREFIX + "__last_sync");
    return v ? Number(v) : null;
  } catch { return null; }
}

async function probeNetwork(): Promise<boolean> {
  try {
    await fetch("/favicon.svg", { method: "HEAD", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

export function useOnline() {
  // Start optimistic: navigator.onLine gives false negatives in some browsers/WebViews,
  // so we only flip to "offline" after a real network probe fails.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      const ok = navigator.onLine === false ? await probeNetwork() : true;
      if (!cancelled) setOnline(ok);
    };

    const on = () => setOnline(true);
    const off = () => { void check(); };

    void check();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    timer = setInterval(() => { if (!navigator.onLine) void check(); }, 15_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}


export function useLastSync(): number | null {
  const [ts, setTs] = useState<number | null>(() => getLastSyncAt());
  useEffect(() => {
    const l = (e: SyncEvent) => setTs(e.at);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return ts;
}
