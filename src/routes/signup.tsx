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

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  validateSearch: (s: Record<string, unknown>) => ({ next: safeNext(s.next) }),
});

function SignupPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [name, setName] = useState("");
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
    const redirectPath = next || "/";
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Готово! Проверьте почту для подтверждения.");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-float-in">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[image:var(--gradient-sky)] shadow-soft">
            <Heart className="h-8 w-8 text-white" fill="white" />
          </div>
          <h1 className="text-3xl font-semibold">Создать аккаунт</h1>
          <p className="text-sm text-muted-foreground">Присоединяйтесь к семейному чату</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Как вас зовут?"
            className="w-full rounded-2xl border border-border bg-card px-5 py-4 outline-none focus:border-primary focus:shadow-soft" />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Эл. почта"
            className="w-full rounded-2xl border border-border bg-card px-5 py-4 outline-none focus:border-primary focus:shadow-soft" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль (мин. 6)"
            className="w-full rounded-2xl border border-border bg-card px-5 py-4 outline-none focus:border-primary focus:shadow-soft" />
          <button type="submit" disabled={busy}
            className="w-full rounded-2xl bg-[image:var(--gradient-sky)] py-4 font-semibold text-white shadow-soft transition active:scale-[0.98] disabled:opacity-60">
            {busy ? "Создаём..." : "Создать аккаунт"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link to="/login" search={next ? { next } : undefined} className="font-semibold text-primary">Войти</Link>
        </p>
      </div>
    </div>
  );
}
