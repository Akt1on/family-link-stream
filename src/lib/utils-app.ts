export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

export function isOnline(lastSeen?: string | null) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 60_000;
}

export function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function daysUntilBirthday(birthday?: string | null): number | null {
  if (!birthday) return null;
  const today = new Date();
  const b = new Date(birthday);
  const next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    next.setFullYear(today.getFullYear() + 1);
  }
  const diff = Math.ceil((next.getTime() - today.setHours(0, 0, 0, 0)) / 86400000);
  return diff;
}

export function userColor(id: string) {
  // deterministic warm/cool from id
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `oklch(0.85 0.09 ${hue})`;
}
