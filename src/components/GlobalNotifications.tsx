import { useEffect, useRef } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSettings, playPing } from "@/lib/settings";
import { daysUntilBirthday } from "@/lib/utils-app";

/**
 * Listens to all new messages and:
 * - Plays a soft ping when a new message arrives outside the active chat.
 * - Triggers a browser Notification if push_enabled and permission granted.
 * - Auto-posts a birthday greeting once per day in groups where it's a member's BD.
 */
export function GlobalNotifications() {
  const { user } = useAuth();
  const { push_enabled, sound_enabled } = useSettings();
  const location = useLocation();
  const activeChatRef = useRef<string | null>(null);
  const profilesRef = useRef<Record<string, string>>({});

  activeChatRef.current = (() => {
    const m = location.pathname.match(/^\/chat\/([^/]+)/);
    return m ? m[1] : null;
  })();

  // Cache profile names for notification labels
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      profilesRef.current = Object.fromEntries(
        (data ?? []).map((p) => [p.id, p.full_name]),
      );
    });
  }, [user?.id]);

  // Subscribe to all new messages in conversations I'm part of (filtered via RLS)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("global-msgs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as {
            id: string;
            conversation_id: string;
            user_id: string;
            content: string | null;
            type: string;
          };
          if (m.user_id === user.id) return;
          if (m.conversation_id === activeChatRef.current) return;

          if (sound_enabled) playPing();
          if (push_enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
            const name = profilesRef.current[m.user_id] ?? "Семья";
            const body =
              m.type === "image" ? "📷 Фотография" :
              m.type === "voice" ? "🎤 Голосовое сообщение" :
              (m.content ?? "");
            try {
              new Notification(name, { body, icon: "/icon-512.png", tag: m.conversation_id });
            } catch {}
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, push_enabled, sound_enabled]);

  // Birthday auto-greeting: once per day per group
  useEffect(() => {
    if (!user) return;
    const runOnce = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const flagKey = `bday-greeted-${today}`;
      const done = new Set<string>(JSON.parse(localStorage.getItem(flagKey) || "[]"));

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, birthday");
      const celebrants = (profs ?? []).filter(
        (p) => p.id !== user.id && daysUntilBirthday(p.birthday) === 0,
      );
      if (celebrants.length === 0) return;

      const { data: mems } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id");
      const myConvs = new Set(
        (mems ?? []).filter((m) => m.user_id === user.id).map((m) => m.conversation_id),
      );

      const { data: convs } = await supabase
        .from("conversations")
        .select("id, is_group")
        .in("id", Array.from(myConvs));
      const groupIds = (convs ?? []).filter((c) => c.is_group).map((c) => c.id);

      for (const cId of groupIds) {
        if (done.has(cId)) continue;
        const memberIds = (mems ?? [])
          .filter((m) => m.conversation_id === cId)
          .map((m) => m.user_id);
        const inGroup = celebrants.filter((c) => memberIds.includes(c.id));
        if (inGroup.length === 0) continue;
        for (const c of inGroup) {
          await supabase.from("messages").insert({
            conversation_id: cId,
            user_id: user.id,
            type: "text",
            content: `🎉🎂 С Днём Рождения, ${c.full_name}! Желаем счастья, здоровья и тёплых моментов с близкими! 💖`,
          });
        }
        done.add(cId);
      }
      localStorage.setItem(flagKey, JSON.stringify(Array.from(done)));
    };

    const t = setTimeout(runOnce, 2000);
    return () => clearTimeout(t);
  }, [user?.id]);

  return null;
}
