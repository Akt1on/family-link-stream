import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Plus, Users, Search, Pin, Archive, ArchiveRestore, X } from "lucide-react";
import { formatTime, isOnline } from "@/lib/utils-app";
import { toast } from "sonner";
import { ChatListSkeleton } from "@/components/ChatSkeleton";
import { haptic } from "@/lib/haptics";

export const Route = createFileRoute("/_app/chats")({ component: ChatsPage });

type Profile = { id: string; full_name: string; avatar_url: string | null; last_seen: string | null; birthday: string | null };
type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  last_message?: { content: string | null; created_at: string | null; type: string; user_id: string } | null;
  other?: Profile;
  member_ids: string[];
  unread: number;
  pinned_at: string | null;
  archived_at: string | null;
};

function ChatsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [search, setSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<
    { conv: Conversation; msg: { id: string; content: string | null; created_at: string | null } }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const startX = useRef(0);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      const { data: allProfiles } = await supabase.from("profiles").select("*").neq("id", user.id);
      const { data: memberRows } = await supabase
        .from("conversation_members")
        .select("conversation_id, pinned_at, archived_at")
        .eq("user_id", user.id);
      const convIds = (memberRows ?? []).map((r) => r.conversation_id);
      const myMemberByConv: Record<string, { pinned_at: string | null; archived_at: string | null }> = {};
      for (const r of memberRows ?? []) {
        myMemberByConv[r.conversation_id] = { pinned_at: r.pinned_at ?? null, archived_at: r.archived_at ?? null };
      }

      let conversations: Conversation[] = [];
      if (convIds.length) {
        const { data: convRows } = await supabase
          .from("conversations").select("*").in("id", convIds);
        const { data: allMembers } = await supabase
          .from("conversation_members").select("conversation_id, user_id").in("conversation_id", convIds);
        const { data: lastMsgs } = await supabase
          .from("messages").select("id, conversation_id, user_id, content, type, created_at")
          .in("conversation_id", convIds).order("created_at", { ascending: false });
        const { data: myReads } = await supabase
          .from("message_reads").select("message_id").eq("user_id", user.id);
        const readIds = new Set((myReads ?? []).map((r) => r.message_id));

        conversations = (convRows ?? []).map((c) => {
          const member_ids = (allMembers ?? []).filter((m) => m.conversation_id === c.id).map((m) => m.user_id);
          const convMsgs = (lastMsgs ?? []).filter((m) => m.conversation_id === c.id);
          const last = convMsgs[0];
          const unread = convMsgs.filter((m) => m.user_id !== user.id && !readIds.has(m.id)).length;
          const otherId = !c.is_group ? member_ids.find((id) => id !== user.id) : undefined;
          const other = otherId ? (allProfiles ?? []).find((p) => p.id === otherId) : undefined;
          const mm = myMemberByConv[c.id];
          return { ...c, member_ids, last_message: last ?? null, other, unread, pinned_at: mm?.pinned_at ?? null, archived_at: mm?.archived_at ?? null };
        });
        conversations.sort((a, b) => {
          if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
          return (b.last_message?.created_at ?? "").localeCompare(a.last_message?.created_at ?? "");
        });
      }

      if (!mounted) return;
      setProfiles(allProfiles ?? []);
      setConvs(conversations);
      setLoading(false);
    };

    load();
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => { reloadTimer = null; load(); }, 300);
    };
    const channel = supabase.channel("chats-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, scheduleReload)
      .subscribe();
    return () => {
      mounted = false;
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Global message search
  useEffect(() => {
    if (!user || search.trim().length < 2) { setGlobalResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const myConvIds = convs.map((c) => c.id);
      if (!myConvIds.length) { setSearching(false); return; }
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, content, created_at, type")
        .in("conversation_id", myConvIds)
        .ilike("content", `%${search.trim()}%`)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      const byConv = Object.fromEntries(convs.map((c) => [c.id, c]));
      setGlobalResults((data ?? []).map((m) => ({ conv: byConv[m.conversation_id], msg: m })).filter((r) => r.conv));
      setSearching(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, convs, user?.id]);

  const startDM = async (other: Profile) => {
    if (!user) return;
    const existing = convs.find(
      (c) => !c.is_group && c.member_ids.includes(other.id) && c.member_ids.length === 2,
    );
    if (existing) { navigate({ to: "/chat/$id", params: { id: existing.id } }); return; }
    const { data: conv, error } = await supabase
      .from("conversations").insert({ is_group: false, created_by: user.id }).select().single();
    if (error || !conv) { toast.error(error?.message ?? "Ошибка"); return; }
    await supabase.from("conversation_members").insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: other.id },
    ]);
    navigate({ to: "/chat/$id", params: { id: conv.id } });
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
    navigate({ to: "/chat/$id", params: { id: conv.id } });
  };

  const togglePin = async (c: Conversation) => {
    if (!user) return;
    haptic("medium");
    const next = c.pinned_at ? null : new Date().toISOString();
    await supabase.from("conversation_members")
      .update({ pinned_at: next })
      .eq("conversation_id", c.id).eq("user_id", user.id);
    setConvs((prev) => prev.map((x) => x.id === c.id ? { ...x, pinned_at: next } : x)
      .sort((a, b) => {
        if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
        return (b.last_message?.created_at ?? "").localeCompare(a.last_message?.created_at ?? "");
      }));
  };

  const toggleArchive = async (c: Conversation) => {
    if (!user) return;
    haptic("medium");
    const next = c.archived_at ? null : new Date().toISOString();
    await supabase.from("conversation_members")
      .update({ archived_at: next, pinned_at: next ? null : c.pinned_at })
      .eq("conversation_id", c.id).eq("user_id", user.id);
    setConvs((prev) => prev.map((x) => x.id === c.id ? { ...x, archived_at: next, pinned_at: next ? null : x.pinned_at } : x));
    toast.success(next ? "В архиве" : "Вернули из архива");
  };

  // Swipe actions on a row
  const onTouchStart = (id: string) => (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    setSwipe({ id, dx: 0 });
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipe) return;
    const dx = Math.max(-140, Math.min(140, e.touches[0].clientX - startX.current));
    setSwipe({ id: swipe.id, dx });
  };
  const onTouchEnd = (c: Conversation) => () => {
    if (!swipe) return;
    if (swipe.dx < -90) toggleArchive(c);
    else if (swipe.dx > 90) togglePin(c);
    setSwipe(null);
  };

  const active = useMemo(() => convs.filter((c) => !c.archived_at), [convs]);
  const archived = useMemo(() => convs.filter((c) => c.archived_at), [convs]);
  const visible = showArchive ? archived : active;

  const renderRow = (c: Conversation, i: number) => {
    const dx = swipe?.id === c.id ? swipe.dx : 0;
    return (
      <li key={c.id} style={{ animationDelay: `${i * 30}ms` }} className="relative animate-float-in overflow-hidden rounded-2xl">
        {/* swipe action backgrounds */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6">
          <div className={`flex items-center gap-2 font-semibold text-primary transition-opacity ${dx > 30 ? "opacity-100" : "opacity-0"}`}>
            <Pin className="h-5 w-5" /> {c.pinned_at ? "Открепить" : "Закрепить"}
          </div>
          <div className={`flex items-center gap-2 font-semibold text-destructive transition-opacity ${dx < -30 ? "opacity-100" : "opacity-0"}`}>
            {c.archived_at ? <><ArchiveRestore className="h-5 w-5" /> Вернуть</> : <><Archive className="h-5 w-5" /> Архив</>}
          </div>
        </div>
        <div
          style={{ transform: `translateX(${dx}px)`, transition: swipe?.id === c.id ? "none" : "transform 0.25s" }}
          onTouchStart={onTouchStart(c.id)}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd(c)}
        >
          <Link to="/chat/$id" params={{ id: c.id }} className="flex items-center gap-3 rounded-2xl bg-background px-3 py-3 transition active:bg-muted">
            {c.is_group ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white shadow-soft">
                <Users className="h-5 w-5" />
              </div>
            ) : (
              <Avatar name={c.other?.full_name} url={c.other?.avatar_url} userId={c.other?.id} online={isOnline(c.other?.last_seen)} size={48} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className={`flex items-center gap-1.5 truncate ${c.unread > 0 ? "font-bold" : "font-semibold"}`}>
                  {c.pinned_at && <Pin className="h-3 w-3 shrink-0 text-primary" fill="currentColor" />}
                  {c.is_group ? c.name : c.other?.full_name ?? "Без имени"}
                </h3>
                <span className={`shrink-0 text-xs ${c.unread > 0 ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  {c.last_message?.created_at ? formatTime(c.last_message.created_at) : ""}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={`truncate text-sm ${c.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {c.last_message
                    ? c.last_message.type === "image" ? "📷 Фотография"
                    : c.last_message.type === "voice" ? "🎤 Голосовое сообщение"
                    : c.last_message.type === "video" ? "🎥 Видео-кружок"
                    : c.last_message.type === "location" ? "📍 Геолокация"
                    : c.last_message.content
                    : "Начните беседу"}
                </p>
                {c.unread > 0 && (
                  <span className="animate-pop ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[image:var(--gradient-peach)] px-1.5 text-[11px] font-bold text-white shadow-warm">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col">
      <header className="safe-top sticky top-0 z-30 glass border-b border-border/40 px-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">{showArchive ? "Архив" : "Чаты"}</h1>
          <div className="flex items-center gap-2">
            {archived.length > 0 && !showArchive && (
              <button onClick={() => setShowArchive(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-muted active:scale-95" aria-label="Архив">
                <Archive className="h-5 w-5" />
              </button>
            )}
            {showArchive && (
              <button onClick={() => setShowArchive(false)} className="flex h-11 w-11 items-center justify-center rounded-full bg-muted active:scale-95" aria-label="Назад"><X className="h-5 w-5" /></button>
            )}
            <button onClick={() => setShowNew(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по сообщениям и чатам"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          )}
        </div>
      </header>

      {loading ? (
        <ChatListSkeleton />
      ) : search.trim().length >= 2 ? (
        <div className="px-3 py-2">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {searching ? "Ищем…" : `${globalResults.length} результатов`}
          </p>
          <ul className="space-y-1">
            {globalResults.map(({ conv, msg }) => {
              const title = conv.is_group ? conv.name : conv.other?.full_name ?? "Без имени";
              return (
                <li key={msg.id}>
                  <Link to="/chat/$id" params={{ id: conv.id }} search={{ q: search.trim() }} className="block rounded-2xl px-3 py-2 transition active:bg-muted">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{msg.created_at ? formatTime(msg.created_at) : ""}</span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{msg.content}</p>
                  </Link>
                </li>
              );
            })}
            {!searching && globalResults.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-muted-foreground">Ничего не нашлось</li>
            )}
          </ul>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky/40">
            {showArchive ? <Archive className="h-9 w-9 text-sky-foreground" /> : <Users className="h-9 w-9 text-sky-foreground" />}
          </div>
          <h2 className="text-xl font-semibold">{showArchive ? "Архив пуст" : "Здесь пока тихо"}</h2>
          <p className="text-sm text-muted-foreground">{showArchive ? "Сюда попадут чаты, которые вы спрячете" : "Создайте семейную группу или напишите близкому"}</p>
          {!showArchive && (
            <button onClick={createFamilyGroup} className="mt-2 rounded-full bg-[image:var(--gradient-sky)] px-5 py-2.5 font-semibold text-white shadow-soft active:scale-95">
              Создать семейную группу
            </button>
          )}
        </div>
      ) : (
        <ul className="px-3 py-2 space-y-0.5">
          {visible.map((c, i) => renderRow(c, i))}
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
