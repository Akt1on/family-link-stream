import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Heart } from "lucide-react";
import { toast } from "sonner";

function safeNext(next: unknown): string {
  if (typeof next !== "string") return "";
  if (!next.startsWith("/") || next.startsWith("//")) return "";
  return next;
}

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const n = safeNext(s.next);
    return n ? { next: n } : {};
  },
});

function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      if (next) window.location.replace(next);
      else navigate({ to: "/chats", replace: true });
    }
  }, [session, navigate, next]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-float-in">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[image:var(--gradient-peach)] shadow-warm">
            <Heart className="h-8 w-8 text-white" fill="white" />
          </div>
          <h1 className="text-3xl font-semibold">Добро пожаловать</h1>
          <p className="text-sm text-muted-foreground">Войдите, чтобы быть ближе к семье</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Эл. почта"
            className="w-full rounded-2xl border border-border bg-card px-5 py-4 outline-none transition focus:border-primary focus:shadow-soft"
          />
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            className="w-full rounded-2xl border border-border bg-card px-5 py-4 outline-none transition focus:border-primary focus:shadow-soft"
          />
          <button
            type="submit" disabled={busy}
            className="w-full rounded-2xl bg-[image:var(--gradient-peach)] py-4 font-semibold text-white shadow-warm transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Входим..." : "Войти"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link to="/signup" search={next ? { next } : {}} className="font-semibold text-primary">Создать</Link>
        </p>
      </div>
    </div>
  );
}
