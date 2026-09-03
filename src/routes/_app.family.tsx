import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Cake, Gift } from "lucide-react";
import { daysUntilBirthday, isOnline } from "@/lib/utils-app";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/family")({
  component: FamilyPage,
  head: () => ({
    meta: [
      { title: "Семья — участники и дни рождения" },
      { name: "description", content: "Все участники семьи, их статус онлайн, ближайшие дни рождения и быстрый переход в личный чат." },
      { property: "og:title", content: "Семья — участники и дни рождения" },
      { property: "og:description", content: "Все участники семьи, их статус онлайн, ближайшие дни рождения и быстрый переход в личный чат." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Profile = { id: string; full_name: string; avatar_url: string | null; birthday: string | null; last_seen: string | null; status: string | null };

function FamilyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").then(({ data }) => setProfiles(data ?? []));
  }, [user?.id]);

  const openDM = async (other: Profile) => {
    if (!user || other.id === user.id || opening) return;
    setOpening(other.id);
    try {
      const { data: mine } = await supabase
        .from("conversation_members").select("conversation_id").eq("user_id", user.id);
      const myIds = (mine ?? []).map((r) => r.conversation_id);
      if (myIds.length) {
        const { data: shared } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", other.id)
          .in("conversation_id", myIds);
        const candidateIds = (shared ?? []).map((r) => r.conversation_id);
        if (candidateIds.length) {
          const { data: convs } = await supabase
            .from("conversations").select("id, is_group").in("id", candidateIds).eq("is_group", false);
          const { data: allMembers } = await supabase
            .from("conversation_members").select("conversation_id, user_id")
            .in("conversation_id", (convs ?? []).map((c) => c.id));
          const found = (convs ?? []).find(
            (c) => (allMembers ?? []).filter((m) => m.conversation_id === c.id).length === 2,
          );
          if (found) { navigate({ to: "/chat/$id", params: { id: found.id } }); return; }
        }
      }
      const { data: conv, error } = await supabase
        .from("conversations").insert({ is_group: false, created_by: user.id }).select().single();
      if (error || !conv) { toast.error(error?.message ?? "Не удалось открыть чат"); return; }
      await supabase.from("conversation_members").insert([
        { conversation_id: conv.id, user_id: user.id },
        { conversation_id: conv.id, user_id: other.id },
      ]);
      navigate({ to: "/chat/$id", params: { id: conv.id } });
    } finally {
      setOpening(null);
    }
  };


  const withBirthday = profiles
    .map((p) => ({ ...p, days: daysUntilBirthday(p.birthday) }))
    .filter((p) => p.days !== null)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const upcoming = withBirthday.filter((p) => (p.days ?? 0) <= 30);

  return (
    <div className="flex flex-col">
      <header className="safe-top sticky top-0 z-30 glass border-b border-border/40 px-5 py-4">
        <h1 className="text-3xl font-semibold">Семья</h1>
        <p className="text-xs text-muted-foreground">{profiles.length} близких рядом</p>
      </header>

      {upcoming.length > 0 && (
        <section className="px-4 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Gift className="h-4 w-4 text-peach-foreground" /> СКОРО ДНИ РОЖДЕНИЯ
          </h2>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4">
            {upcoming.map((p, i) => (
              <div key={p.id} style={{ animationDelay: `${i * 40}ms` }}
                className="animate-float-in flex w-40 shrink-0 flex-col items-center gap-2 rounded-3xl bg-[image:var(--gradient-peach)] p-4 text-center text-white shadow-warm">
                <Avatar name={p.full_name} url={p.avatar_url} userId={p.id} size={56} />
                <div>
                  <p className="font-semibold">{p.full_name}</p>
                  <p className="mt-1 text-xs opacity-90">
                    {p.days === 0 ? "🎉 Сегодня!" : p.days === 1 ? "Завтра" : `через ${p.days} дн.`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="px-4 pb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">ВСЕ УЧАСТНИКИ</h2>
        <ul className="space-y-2">
          {profiles.map((p, i) => (
            <li key={p.id} style={{ animationDelay: `${i * 25}ms` }} className="animate-float-in">
              <button
                type="button"
                onClick={() => openDM(p)}
                disabled={p.id === user?.id || opening === p.id}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-soft transition active:scale-[0.99] disabled:active:scale-100"
              >
                <Avatar name={p.full_name} url={p.avatar_url} userId={p.id} online={isOnline(p.last_seen)} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">{p.full_name}{p.id === user?.id && <span className="ml-1 text-xs text-muted-foreground">(вы)</span>}</h3>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {opening === p.id ? "Открываем чат…" : isOnline(p.last_seen) ? "в сети" : "не в сети"}
                  </p>
                </div>
                {p.birthday && (
                  <div className="flex items-center gap-1 rounded-full bg-peach/30 px-2.5 py-1 text-xs text-peach-foreground">
                    <Cake className="h-3 w-3" />
                    {new Date(p.birthday).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                  </div>
                )}
              </button>
            </li>
          ))}

        </ul>
      </section>
    </div>
  );
}
