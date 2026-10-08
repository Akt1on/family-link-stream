import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ensureFamilyChat } from "@/lib/family.functions";
import { BottomNav } from "@/components/BottomNav";
import { BrandMark } from "@/components/BrandMark";
import { AmbientGlow } from "@/components/AmbientGlow";
import { KeyRound, LogOut } from "lucide-react";

export const Route = createFileRoute("/_app")({ component: AppLayout });

const INVITE_KEY = "family_invite";

function AppLayout() {
  const { session, loading, user } = useAuth();
  const ensureChat = useServerFn(ensureFamilyChat);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fullScreen = pathname.startsWith("/chat/");
  const [gate, setGate] = useState<"checking" | "ok" | "invite">("checking");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const join = async (invite?: string) => {
    try {
      const res = await ensureChat({ data: { invite } });
      if (res.needsInvite) {
        setGate("invite");
        if (invite) setErr("Неверный код. Уточните его у родных.");
      } else {
        localStorage.removeItem(INVITE_KEY);
        setGate("ok");
      }
    } catch (e) {
      console.warn("ensureFamilyChat failed", e);
      setGate("ok"); // network problem: don't lock members out of cached chats
    }
  };

  useEffect(() => {
    if (!user) return;
    const saved = localStorage.getItem(INVITE_KEY) ?? undefined;
    void join(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Heartbeat: keep "online" status truthful while the app is visible.
  useEffect(() => {
    if (!user) return;
    const ping = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      void supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", user.id);
    };
    ping();
    const t = setInterval(ping, 30_000);
    document.addEventListener("visibilitychange", ping);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", ping); };
  }, [user?.id]);

  if (loading || (session && gate === "checking")) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <AmbientGlow />
        <BrandMark size={64} className="animate-pulse" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  if (gate === "invite") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
        <AmbientGlow />
        <div className="relative w-full max-w-sm animate-float-in">
          <div className="mb-8 flex flex-col items-center gap-4 text-center">
            <BrandMark size={64} />
            <h1 className="text-3xl font-semibold tracking-tight">Код семьи</h1>
            <p className="text-sm text-muted-foreground">Попросите код у любого члена семьи — он есть в его профиле.</p>
          </div>
          <form
            onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(""); await join(code); setBusy(false); }}
            className="space-y-3"
          >
            <div className="relative">
              <KeyRound className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" required
                className="lux-input w-full rounded-2xl py-4 pl-12 pr-5 text-center font-mono text-lg tracking-[0.25em]" />
            </div>
            {err && <p className="text-center text-sm text-destructive">{err}</p>}
            <button disabled={busy} className="btn-gold w-full rounded-2xl py-4 font-semibold active:scale-[0.98] disabled:opacity-60">
              {busy ? "Проверяем..." : "Войти в семью"}
            </button>
          </form>
          <button onClick={() => supabase.auth.signOut()} className="mx-auto mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative mx-auto flex min-h-screen max-w-md flex-col ${fullScreen ? "" : "pb-24"}`}>
      {!fullScreen && <AmbientGlow subtle />}
      <div className="relative flex min-h-0 flex-1 flex-col"><Outlet /></div>
      {!fullScreen && <BottomNav />}
    </div>
  );
}
