import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Camera, LogOut, Save, Moon, Sun, Bell, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/lib/settings";

export const Route = createFileRoute("/_app/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState("");
  const [birthday, setBirthday] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setFullName(data.full_name ?? "");
        setStatus(data.status ?? "");
        setBirthday(data.birthday ?? "");
        setAvatarUrl(data.avatar_url);
      }
    });
  }, [user?.id]);

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, f, { contentType: f.type, upsert: true });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(publicUrl);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    toast.success("Аватар обновлён");
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName, status, birthday: birthday || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Сохранено");
  };

  return (
    <div className="flex flex-col">
      <header className="safe-top sticky top-0 z-30 glass border-b border-border/40 px-5 py-4">
        <h1 className="text-3xl font-semibold">Профиль</h1>
      </header>

      <div className="flex flex-col items-center gap-3 px-6 py-6">
        <div className="relative">
          <Avatar name={fullName} url={avatarUrl} userId={user?.id} size={108} />
          <label className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95">
            <Camera className="h-4 w-4" />
            <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <div className="space-y-3 px-5">
        <Field label="Имя">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary" />
        </Field>
        <Field label="Статус">
          <input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Например: Люблю свою семью ❤️"
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary" />
        </Field>
        <Field label="День рождения">
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 outline-none focus:border-primary" />
        </Field>

        <button onClick={save} disabled={saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[image:var(--gradient-peach)] py-3.5 font-semibold text-white shadow-warm active:scale-[0.98] disabled:opacity-60">
          <Save className="h-4 w-4" /> {saving ? "Сохраняем..." : "Сохранить"}
        </button>

        <button onClick={signOut}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 font-semibold text-muted-foreground active:scale-[0.98]">
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 ml-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
