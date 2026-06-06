// Browser-side Web Push subscription helpers.
export const PUBLIC_VAPID_KEY =
  "BCasMHxqZXomO8oTWn8a6uxUBjzHwbRUGDancGiCI1wth70XsQYAJrhTLL0AlEpQWHxQoqFMxIJjmcb0enxYLJs";

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function enablePush(): Promise<PushSubscriptionJSON | null> {
  if (!pushSupported()) return null;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;
  const reg = await navigator.serviceWorker.register("/push-sw.js");
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });
  }
  return sub.toJSON();
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try { await sub.unsubscribe(); } catch {}
  }
}
