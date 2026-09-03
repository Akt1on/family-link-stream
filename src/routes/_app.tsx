import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { ensureFamilyChat } from "@/lib/family.functions";
import { BottomNav } from "@/components/BottomNav";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { session, loading, user } = useAuth();
  const ensureChat = useServerFn(ensureFamilyChat);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fullScreen = pathname.startsWith("/chat/");

  // Every signed-in family member is automatically part of the shared group chat.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureChat({ data: undefined });
      } catch (e) {
        if (!cancelled) console.warn("ensureFamilyChat failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Heart className="h-10 w-10 animate-pulse text-peach" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  // Full-screen surfaces (chat) own their own layout: no bottom nav, no padding,
  // otherwise the message composer is pushed underneath the tab bar.
  return (
    <div className={`mx-auto flex min-h-screen max-w-md flex-col ${fullScreen ? "" : "pb-20"}`}>
      <Outlet />
      {!fullScreen && <BottomNav />}
    </div>
  );
}
