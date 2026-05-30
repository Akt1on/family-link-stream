import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/album")({ component: AlbumPage });

type Photo = { id: string; user_id: string; photo_url: string; caption: string | null; created_at: string | null };
type Profile = { id: string; full_name: string; avatar_url: string | null };

function AlbumPage() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from("album_photos").select("*").order("created_at", { ascending: false });
      setPhotos(data ?? []);
      const ids = Array.from(new Set((data ?? []).map((p) => p.user_id)));
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("*").in("id", ids);
        setProfiles(Object.fromEntries((p ?? []).map((x) => [x.id, x])));
      }
    };
    load();
    const ch = supabase.channel("album").on("postgres_changes", { event: "*", schema: "public", table: "album_photos" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const caption = prompt("Подпись (необязательно)") ?? "";
    const ext = f.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("album").upload(path, f, { contentType: f.type });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("album").getPublicUrl(path);
    await supabase.from("album_photos").insert({ user_id: user.id, photo_url: publicUrl, caption });
    setUploading(false);
    e.target.value = "";
    toast.success("Фото добавлено в альбом");
  };

  return (
    <div className="flex flex-col">
      <header className="safe-top sticky top-0 z-30 glass border-b border-border/40 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Альбом</h1>
            <p className="text-xs text-muted-foreground">Общие моменты семьи</p>
          </div>
          <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95">
            <Plus className="h-5 w-5" />
            <input type="file" accept="image/*" className="hidden" onChange={upload} disabled={uploading} />
          </label>
        </div>
      </header>

      {photos.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          Альбом пока пуст. Поделитесь первой фотографией ❤️
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1 p-1">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setViewing(p)} style={{ animationDelay: `${i * 20}ms` }}
              className="animate-float-in aspect-square overflow-hidden rounded-lg bg-muted active:opacity-80">
              <img src={p.photo_url} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 animate-float-in" onClick={() => setViewing(null)}>
          <div className="safe-top flex items-center justify-between p-4 text-white">
            <div className="flex items-center gap-3">
              <Avatar name={profiles[viewing.user_id]?.full_name} url={profiles[viewing.user_id]?.avatar_url} userId={viewing.user_id} size={36} />
              <div>
                <p className="text-sm font-semibold">{profiles[viewing.user_id]?.full_name}</p>
                <p className="text-xs text-white/60">{viewing.created_at ? new Date(viewing.created_at).toLocaleDateString("ru-RU") : ""}</p>
              </div>
            </div>
            <button onClick={() => setViewing(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            <img src={viewing.photo_url} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
          {viewing.caption && <p className="safe-bottom p-4 text-center text-white">{viewing.caption}</p>}
        </div>
      )}
    </div>
  );
}
