import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Share2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { getFamilyInvite } from "@/lib/family.functions";

export function InviteCard() {
  const fetchInvite = useServerFn(getFamilyInvite);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    fetchInvite().then((r) => setCode(r.code)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!code) return null;
  const link = `${window.location.origin}/signup?invite=${code}`;

  const share = async () => {
    const text = `Присоединяйся к нашей семье! Код: ${code}\n${link}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Семья", text, url: link }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(text);
    toast.success("Приглашение скопировано");
  };

  return (
    <div className="lux-card relative mt-4 overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/25 blur-3xl" />
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5 text-primary" /> Код семьи
      </div>
      <div className="mt-2 font-mono text-3xl font-semibold tracking-[0.2em] text-gold">{code}</div>
      <p className="mt-1 text-xs text-muted-foreground">Без этого кода никто не попадёт в ваш семейный круг.</p>
      <div className="mt-4 flex gap-2">
        <button onClick={() => { navigator.clipboard.writeText(code); toast.success("Код скопирован"); }}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-muted/50 py-2.5 text-sm font-semibold active:scale-[0.98]">
          <Copy className="h-4 w-4" /> Копировать
        </button>
        <button onClick={share}
          className="btn-gold flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-semibold active:scale-[0.98]">
          <Share2 className="h-4 w-4" /> Пригласить
        </button>
      </div>
    </div>
  );
}
