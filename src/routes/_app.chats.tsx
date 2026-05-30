import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Plus, Users, Search } from "lucide-react";
import { formatTime, isOnline } from "@/lib/utils-app";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chats")({ component: ChatsPage });

type Profile = { id: string; full_name: string; avatar_url: string | null; last_seen: string | null; birthday: string | null };
type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  last_message?: { content: string | null; created_at: string | null; type: string } | null;
  other?: Profile;
  member_ids: string[];
};

function ChatsPage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      const { data: allProfiles } = await supabase.from("profiles").select("*").neq("id", user.id);
      const { data: memberRows } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user.id);
      const convIds = (memberRows ?? []).map((r) => r.conversation_id);

      let conversations: Conversation[] = [];
      if (convIds.length) {
        const { data: convRows } = await supabase
          .from("conversations").select("*").in("id", convIds);
        const { data: allMembers } = await supabase
          .from("conversation_members").select("*").in("conversation_id", convIds);
        const { data: lastMsgs } = await supabase
          .from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false });

        conversations = (convRows ?? []).map((c) => {
          const member_ids = (allMembers ?? []).filter((m) => m.conversation_id === c.id).map((m) => m.user_id);
          const last = (lastMsgs ?? []).find((m) => m.conversation_id === c.id);
          const otherId = !c.is_group ? member_ids.find((id) => id !== user.id) : undefined;
          const other = otherId ? (allProfiles ?? []).find((p) => p.id === otherId) : undefined;
          return { ...c, member_ids, last_message: last ?? null, other };
        });
        conversations.sort((a, b) =>
          (b.last_message?.created_at ?? "").localeCompare(a.last_message?.created_at ?? "")
        );
      }

      if (!mounted) return;
      setProfiles(allProfiles ?? []);
      setConvs(conversations);
      setLoading(false);
    };

    load();
    const channel = supabase.channel("chats-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, load)
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  const startDM = async (other: Profile) => {
    if (!user) return;
    // find existing 1:1
    const existing = convs.find(
      (c) => !c.is_group && c.member_ids.includes(other.id) && c.member_ids.length === 2
    );
    if (existing) { window.location.href = `/chat/${existing.id}`; return; }

    const { data: conv, error } = await supabase
      .from("conversations").insert({ is_group: false, created_by: user.id }).select().single();
    if (error || !conv) { toast.error(error?.message ?? "Ошибка"); return; }
    await supabase.from("conversation_members").insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: other.id },
    ]);
    window.location.href = `/chat/${conv.id}`;
  };

  const createFamilyGroup = async () => {
    if (!user || profiles.length === 0) return;
    const name = prompt("Название группы", "Семья ❤️");
    if (!name) return;
    const { data: conv, error } = await supabase
      .from("conversations").insert({ is_group: true, name, created_by: user.id }).select().single();
    if (error || !conv) { toast.error(error?.message ?? "Ошибка"); return; }
    const members = [{ conversation_id: conv.id, user_id: user.id }, ...profiles.map((p) => ({ conversation_id: conv.id, user_id: p.id }))];
    await supabase.from("conversation_members").insert(members);
    toast.success("Группа создана");
    window.location.href = `/chat/${conv.id}`;
  };

  return (
    <div className="flex flex-col">
      <header className="safe-top sticky top-0 z-30 glass border-b border-border/40 px-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">Чаты</h1>
          <button onClick={() => setShowNew(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-10 text-center text-muted-foreground">Загружаем…</div>
      ) : convs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky/40">
            <Users className="h-9 w-9 text-sky-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Здесь пока тихо</h2>
          <p className="text-sm text-muted-foreground">Создайте семейную группу или напишите близкому</p>
          <button onClick={createFamilyGroup} className="mt-2 rounded-full bg-[image:var(--gradient-sky)] px-5 py-2.5 font-semibold text-white shadow-soft active:scale-95">
            Создать семейную группу
          </button>
        </div>
      ) : (
        <ul className="px-3 py-2">
          {convs.map((c, i) => (
            <li key={c.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-float-in">
              <Link to="/chat/$id" params={{ id: c.id }} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition active:bg-muted">
                {c.is_group ? (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white shadow-soft">
                    <Users className="h-5 w-5" />
                  </div>
                ) : (
                  <Avatar name={c.other?.full_name} url={c.other?.avatar_url} userId={c.other?.id} online={isOnline(c.other?.last_seen)} size={48} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-semibold">{c.is_group ? c.name : c.other?.full_name ?? "Без имени"}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.last_message ? formatTime(c.last_message.created_at) : ""}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.last_message
                      ? c.last_message.type === "image" ? "📷 Фотография"
                      : c.last_message.type === "voice" ? "🎤 Голосовое сообщение"
                      : c.last_message.content
                      : "Начните беседу"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-float-in" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-card p-5 pb-8 shadow-warm" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <h2 className="mb-3 text-xl font-semibold">Новый чат</h2>
            <button onClick={createFamilyGroup} className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-[image:var(--gradient-sky)] px-4 py-3 text-left text-white shadow-soft">
              <Users className="h-5 w-5" />
              <span className="font-semibold">Создать семейную группу</span>
            </button>
            <div className="mb-2 flex items-center gap-2 rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" /> Найти близкого
            </div>
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button onClick={() => startDM(p)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition active:bg-muted">
                    <Avatar name={p.full_name} url={p.avatar_url} userId={p.id} online={isOnline(p.last_seen)} />
                    <div className="text-left">
                      <div className="font-semibold">{p.full_name}</div>
                      <div className="text-xs text-muted-foreground">{isOnline(p.last_seen) ? "в сети" : "не в сети"}</div>
                    </div>
                  </button>
                </li>
              ))}
              {profiles.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Пока никого нет. Пригласите близких в приложение!</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
