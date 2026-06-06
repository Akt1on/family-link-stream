import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Theme = "light" | "dark";

type Settings = {
  theme: Theme;
  push_enabled: boolean;
  sound_enabled: boolean;
};

type Ctx = Settings & {
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setPushEnabled: (v: boolean) => Promise<void>;
  setSoundEnabled: (v: boolean) => void;
};

const DEFAULTS: Settings = {
  theme: "light",
  push_enabled: false,
  sound_enabled: true,
};

const SettingsContext = createContext<Ctx>({
  ...DEFAULTS,
  setTheme: () => {},
  toggleTheme: () => {},
  setPushEnabled: async () => {},
  setSoundEnabled: () => {},
});

function readLocal(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem("settings");
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return { ...DEFAULTS, theme: prefersDark ? "dark" : "light" };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(() => readLocal());

  // apply theme to <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    document.documentElement.style.colorScheme = settings.theme;
    try {
      localStorage.setItem("settings", JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // sync with server when user logs in
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        if (data) {
          setSettings({
            theme: (data.theme as Theme) || "light",
            push_enabled: !!data.push_enabled,
            sound_enabled: data.sound_enabled !== false,
          });
        } else {
          supabase.from("user_settings").insert({ user_id: user.id });
        }
      });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const persist = async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (user) {
      await supabase
        .from("user_settings")
        .upsert({
          user_id: user.id,
          ...patch,
          updated_at: new Date().toISOString(),
        });
    }
  };

  const value = useMemo<Ctx>(
    () => ({
      ...settings,
      setTheme: (t) => persist({ theme: t }),
      toggleTheme: () =>
        persist({ theme: settings.theme === "dark" ? "light" : "dark" }),
      setPushEnabled: async (v) => {
        if (v) {
          const { enablePush } = await import("@/lib/push-client");
          const sub = await enablePush();
          if (!sub) return;
          await persist({ push_enabled: true });
          if (user) {
            await supabase
              .from("user_settings")
              .upsert({
                user_id: user.id,
                push_subscription: sub as any,
                push_enabled: true,
                updated_at: new Date().toISOString(),
              });
          }
        } else {
          const { disablePush } = await import("@/lib/push-client");
          await disablePush();
          await persist({ push_enabled: false });
          if (user) {
            await supabase
              .from("user_settings")
              .update({ push_subscription: null })
              .eq("user_id", user.id);
          }
        }
      },
      setSoundEnabled: (v) => persist({ sound_enabled: v }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, user?.id],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);

// Lightweight ping sound (base64 wav)
let pingAudio: HTMLAudioElement | null = null;
export function playPing() {
  if (typeof window === "undefined") return;
  try {
    if (!pingAudio) {
      pingAudio = new Audio(
        "data:audio/wav;base64,UklGRn4DAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YVoDAAA=" +
          "AAAAAAAAAAAAAAA=",
      );
      pingAudio.volume = 0.4;
    }
    pingAudio.currentTime = 0;
    void pingAudio.play().catch(() => {});
  } catch {}
}
