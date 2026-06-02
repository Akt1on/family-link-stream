import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/call/$id")({
  component: CallPage,
  validateSearch: (s: Record<string, unknown>) => ({
    mode: s.mode === "audio" ? "audio" as const : "video" as const,
  }),
});

declare global {
  interface Window { JitsiMeetExternalAPI?: any }
}

function CallPage() {
  const { id } = Route.useParams();
  const { mode } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    const init = () => {
      if (!containerRef.current || !window.JitsiMeetExternalAPI) return;
      apiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: `family-${id}`,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName: user?.user_metadata?.full_name || user?.email || "Гость" },
        configOverwrite: {
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          startWithAudioMuted: false,
          startWithVideoMuted: mode === "audio",
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
        },
      });
      apiRef.current.addEventListener("readyToClose", () => navigate({ to: "/chats" }));
    };

    if (window.JitsiMeetExternalAPI) {
      init();
    } else {
      const s = document.createElement("script");
      s.src = "https://meet.jit.si/external_api.js";
      s.async = true;
      s.onload = init;
      document.body.appendChild(s);
    }

    return () => { try { apiRef.current?.dispose(); } catch {} };
  }, [id, user?.id, mode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="safe-top flex items-center gap-3 bg-black/60 px-3 py-3 text-white">
        <Link to="/chat/$id" params={{ id }} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="font-semibold">{mode === "video" ? "Видеозвонок" : "Аудиозвонок"}</h2>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
