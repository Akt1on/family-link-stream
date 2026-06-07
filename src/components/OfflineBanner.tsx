import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useOnline, useLastSync } from "@/lib/offline-cache";

function formatAgo(ts: number | null): string {
  if (!ts) return "никогда";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "только что";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

export function OfflineBanner() {
  const online = useOnline();
  const lastSync = useLastSync();
  const [justBack, setJustBack] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) { setWasOffline(true); return; }
    if (wasOffline) {
      setJustBack(true);
      const t = setTimeout(() => { setJustBack(false); setWasOffline(false); }, 2400);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  if (online && !justBack) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium shadow-md transition-colors ${
        online
          ? "bg-emerald-500/95 text-white"
          : "bg-amber-500/95 text-white"
      }`}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      {online ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Сеть восстановлена — синхронизация…</span>
        </>
      ) : (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          <span>
            Нет сети — показаны сохранённые данные · обновлено {formatAgo(lastSync)}
          </span>
          <RefreshCw className="h-3.5 w-3.5 animate-spin opacity-70" />
        </>
      )}
    </div>
  );
}
