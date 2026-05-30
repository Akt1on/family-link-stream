import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { BottomNav } from "@/components/BottomNav";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Heart className="h-10 w-10 animate-pulse text-peach" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}
