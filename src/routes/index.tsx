import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

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
