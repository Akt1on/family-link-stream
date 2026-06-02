import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Forward, Users, X, Check } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/haptics";

type Target = {
  id: string;
  name: string;
  avatar: string | null;
  is_group: boolean;
  userId?: string;
};

type Props = {
  message: {
    id: string;
    conversation_id: string;
    content: string | null;
    type: string;
    media_url: string | null;
    link_preview: any;
  };
  onClose: () => void;
};

export function ForwardDialog({ message, onClose }: Props) {
  const { user } = useAuth();
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: memberRows } = await supabase
        .from("conversation_members").select("conversation_id").eq("user_id", user.id);
      const ids = (memberRows ?? []).map((r) => r.conversation_id);
      const list: Target[] = [];
      if (ids.length) {
        const { data: convs } = await supabase.from("conversations").select("*").in("id", ids);
        const { data: allMembers } = await supabase
          .from("conversation_members").select("conversation_id, user_id").in("conversation_id", ids);
        const otherIds = Array.from(new Set(
          (allMembers ?? []).filter((m) => m.user_id !== user.id).map((m) => m.user_id),
        ));
        const { data: profs } = otherIds.length
          ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", otherIds)
          : { data: [] as { id: string; full_name: string; avatar_url: string | null }[] };
        const profById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
        for (const c of convs ?? []) {
          if (c.is_group) {
            list.push({ id: c.id, name: c.name ?? "Группа", avatar: null, is_group: true });
          } else {
            const otherId = (allMembers ?? [])
              .filter((m) => m.conversation_id === c.id && m.user_id !== user.id)[0]?.user_id;
            if (otherId) {
              const p = profById[otherId];
              list.push({ id: c.id, name: p?.full_name ?? "—", avatar: p?.avatar_url ?? null, is_group: false, userId: otherId });
            }
          }
        }
      }
      setTargets(list);
      setLoading(false);
    })();
  }, [user?.id]);

  const toggle = (id: string) => {
    haptic("light");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const forward = async () => {
    if (!user || selected.size === 0) return;
    setSending(true);
    const rows = Array.from(selected).map((convId) => ({
      conversation_id: convId,
      user_id: user.id,
      content: message.content ?? "",
      type: message.type,
      media_url: message.media_url,
      link_preview: message.link_preview ?? null,
      forwarded_from_conversation_id: message.conversation_id,
    }));
    const { error } = await supabase.from("messages").insert(rows as any);
    setSending(false);
    if (error) { toast.error(error.message); return; }
    haptic("success");
    toast.success(`Переслано в ${selected.size} ${selected.size === 1 ? "чат" : "чатов"}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-card pb-8 shadow-warm animate-float-in" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl bg-card px-5 py-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Forward className="h-5 w-5" /> Переслать</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-2">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Загружаем чаты…</p>
          ) : targets.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Нет других чатов</p>
          ) : (
            <ul>
              {targets.map((t) => {
                const isOn = selected.has(t.id);
                return (
                  <li key={t.id}>
                    <button onClick={() => toggle(t.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition ${isOn ? "bg-primary/10" : "active:bg-muted"}`}>
                      {t.is_group ? (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white"><Users className="h-5 w-5" /></div>
                      ) : (
                        <Avatar name={t.name} url={t.avatar} userId={t.userId} size={44} />
                      )}
                      <span className="flex-1 truncate text-left font-semibold">{t.name}</span>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${isOn ? "border-primary bg-primary text-white" : "border-border"}`}>
                        {isOn && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {selected.size > 0 && (
          <div className="px-5 pt-3">
            <button
              onClick={forward}
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[image:var(--gradient-peach)] py-3 font-semibold text-white shadow-warm transition active:scale-[0.98] disabled:opacity-60"
            >
              <Forward className="h-4 w-4" />
              Переслать в {selected.size} {selected.size === 1 ? "чат" : "чатов"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
