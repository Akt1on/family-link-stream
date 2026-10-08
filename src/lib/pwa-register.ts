// Guarded registration of the offline app-shell service worker (/sw.js).
// Never registers in dev, Lovable preview, or iframes; supports ?sw=off kill switch.
// The push messaging worker (/push-sw.js) is separate and untouched.

const BLOCKED_HOSTS = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];

function isBlockedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return true;
  if (window.self !== window.top) return true;
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (BLOCKED_HOSTS.some((b) => h === b || h.endsWith(`.${b}`))) return true;
  return false;
}

async function unregisterAppSw(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => r.active?.scriptURL.endsWith("/sw.js"))
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export async function registerAppSw(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  if (isBlockedContext() || killSwitch) {
    await unregisterAppSw();
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch {
    /* offline SW is best-effort */
  }
}
