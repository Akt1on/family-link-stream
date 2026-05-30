import { initials, userColor } from "@/lib/utils-app";

export function Avatar({
  name, url, userId, size = 44, online,
}: { name?: string | null; url?: string | null; userId?: string; size?: number; online?: boolean }) {
  const s = { width: size, height: size };
  return (
    <div className="relative shrink-0">
      <div
        className="flex items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-soft"
        style={{ ...s, background: userId ? userColor(userId) : "var(--peach)" }}
      >
        {url ? (
          <img src={url} alt={name ?? ""} className="h-full w-full object-cover" />
        ) : (
          <span style={{ fontSize: size * 0.4 }}>{initials(name).toUpperCase()}</span>
        )}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
      )}
    </div>
  );
}
