import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, Image, Cake, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const items = [
  { to: "/chats", label: "Чаты", icon: MessageCircle },
  { to: "/album", label: "Альбом", icon: Image },
  { to: "/family", label: "Семья", icon: Cake },
  { to: "/profile", label: "Профиль", icon: User },
] as const;

/** Unread badge: new messages from others since the user last opened the chats list. */
function useUnread(active: boolean) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    if (active) { localStorage.setItem("chats_seen_at", new Date().toISOString()); setCount(0); return; }
    const ch = supabase
      .channel(`nav-unread-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
        if ((p.new as { user_id?: string }).user_id !== user.id) setCount((c) => c + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, active]);
  return count;
}

export function BottomNav() {
  const { pathname } = useLocation();
  const unread = useUnread(pathname.startsWith("/chats"));
  return (
    <nav className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-3">
      <ul className="pointer-events-auto mx-auto flex max-w-md items-stretch justify-around rounded-[28px] border border-border/70 px-2 py-1.5 shadow-lux glass">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to} className="flex-1">
              <Link to={to} className="relative flex flex-col items-center gap-0.5 rounded-2xl py-2 transition active:scale-95">
                <span className="relative">
                  <Icon className={`h-[22px] w-[22px] transition ${active ? "text-primary" : "text-muted-foreground"}`}
                    strokeWidth={active ? 2.3 : 1.7} />
                  {to === "/chats" && unread > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground animate-pop">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </span>
                <span className={`text-[10.5px] font-semibold tracking-tight ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                <span className={`absolute -bottom-0.5 h-[3px] rounded-full bg-primary transition-all ${active ? "w-5 opacity-100" : "w-0 opacity-0"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
