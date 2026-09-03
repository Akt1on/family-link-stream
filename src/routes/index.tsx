import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Семейный мессенджер — чат, звонки и альбом" },
      { name: "description", content: "Тёплый семейный мессенджер: групповой чат, личные сообщения, аудио- и видеозвонки, общий фотоальбом и дни рождения." },
      { property: "og:title", content: "Семейный мессенджер — чат, звонки и альбом" },
      { property: "og:description", content: "Тёплый семейный мессенджер: групповой чат, личные сообщения, аудио- и видеозвонки, общий фотоальбом и дни рождения." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Index() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Heart className="h-10 w-10 animate-pulse text-peach" />
      </div>
    );
  }
  return <Navigate to={session ? "/chats" : "/login"} replace />;
}
