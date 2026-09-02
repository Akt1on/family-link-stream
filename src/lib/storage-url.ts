import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Buckets that are private — their files need a short-lived signed URL. */
const PRIVATE_BUCKETS = ["media", "album"];
const EXPIRES_IN = 60 * 60; // 1 hour
const REFRESH_BEFORE = 50 * 60 * 1000; // re-sign after 50 min

type CacheEntry = { url: string; at: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string>>();

/** Extracts { bucket, path } from a stored Supabase storage URL, when it points at a private bucket. */
function parseStorageUrl(raw: string): { bucket: string; path: string } | null {
  if (!raw || raw.startsWith("geo:") || raw.startsWith("blob:") || raw.startsWith("data:")) return null;
  const match = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!match) return null;
  const bucket = match[1];
  if (!PRIVATE_BUCKETS.includes(bucket)) return null;
  return { bucket, path: decodeURIComponent(match[2]) };
}

/** Returns a usable URL: signed for private buckets, unchanged otherwise. */
export async function resolveStorageUrl(raw: string): Promise<string> {
  const parsed = parseStorageUrl(raw);
  if (!parsed) return raw;

  const key = `${parsed.bucket}/${parsed.path}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < REFRESH_BEFORE) return cached.url;

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, EXPIRES_IN);
    const url = error || !data?.signedUrl ? raw : data.signedUrl;
    cache.set(key, { url, at: Date.now() });
    inflight.delete(key);
    return url;
  })();
  inflight.set(key, task);
  return task;
}

/** Signed URL for a single stored media URL. */
export function useStorageUrl(raw: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (raw ? cache.get(keyOf(raw))?.url ?? undefined : undefined));

  useEffect(() => {
    let cancelled = false;
    if (!raw) { setUrl(undefined); return; }
    resolveStorageUrl(raw).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [raw]);

  return url;
}

function keyOf(raw: string) {
  const parsed = parseStorageUrl(raw);
  return parsed ? `${parsed.bucket}/${parsed.path}` : raw;
}

/** Signed URLs for a list of stored media URLs, keyed by the original URL. */
export function useStorageUrls(raws: (string | null | undefined)[]): Record<string, string> {
  const list = useMemo(() => Array.from(new Set(raws.filter(Boolean) as string[])), [raws.join("|")]);
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    if (!list.length) return;
    Promise.all(list.map(async (raw) => [raw, await resolveStorageUrl(raw)] as const)).then((pairs) => {
      if (cancelled) return;
      setMap((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [list.join("|")]);

  return map;
}
