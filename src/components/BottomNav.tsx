import { Link, useLocation } from "@tanstack/react-router";
import { MessageCircle, Image, Cake, User } from "lucide-react";

const items = [
  { to: "/chats", label: "Чаты", icon: MessageCircle },
  { to: "/album", label: "Альбом", icon: Image },
  { to: "/family", label: "Семья", icon: Cake },
  { to: "/profile", label: "Профиль", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 glass">
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 py-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to} className="flex-1">
              <Link to={to} className="flex flex-col items-center gap-1 rounded-2xl py-2 transition active:scale-95">
                <Icon className={`h-6 w-6 transition ${active ? "text-peach-foreground" : "text-muted-foreground"}`}
                  fill={active ? "currentColor" : "none"} strokeWidth={active ? 2.2 : 1.8} />
                <span className={`text-[11px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
