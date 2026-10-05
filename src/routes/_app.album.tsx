import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStorageUrls } from "@/lib/storage-url";
import { Lightbox } from "@/components/Lightbox";

export const Route = createFileRoute("/_app/album")({
  component: AlbumPage,
  head: () => ({
    meta: [
      { title: "Семейный альбом — общие фотографии" },
      { name: "description", content: "Общий фотоальбом семьи: загружайте снимки с подписями и смотрите моменты всех участников." },
      { property: "og:title", content: "Семейный альбом — общие фотографии" },
      { property: "og:description", content: "Общий фотоальбом семьи: загружайте снимки с подписями и смотрите моменты всех участников." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Photo = { id: string; user_id: string; photo_url: string; caption: string | null; created_at: string | null };
type Profile = { id: string; full_name: string; avatar_url: string | null };

function AlbumPage() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [viewing, setViewing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  // The album bucket is private — display through short-lived signed URLs.
  const photoUrls = useStorageUrls(photos.map((p) => p.photo_url));


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

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Можно загружать только изображения"); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error("Файл больше 15 МБ"); return; }
    setCaption("");
    setPending(f);
  };

  const upload = async () => {
    if (!user || !pending) return;
    setUploading(true);
    const f = pending;
    const ext = f.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("album").upload(path, f, { contentType: f.type });
    if (upErr) { toast.error(upErr.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("album").getPublicUrl(path);
    const { error } = await supabase.from("album_photos").insert({ user_id: user.id, photo_url: publicUrl, caption: caption.trim() });
    setUploading(false);
    setPending(null);
    setCaption("");
    if (error) { toast.error(error.message); return; }
    toast.success("Фото добавлено в альбом");
  };

  const removePhoto = async (p: Photo) => {
    if (!user || p.user_id !== user.id) return;
    setViewing(null);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    const { error } = await supabase.from("album_photos").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    const path = p.photo_url.split("/album/")[1];
    if (path) await supabase.storage.from("album").remove([decodeURIComponent(path.split("?")[0])]);
    toast.success("Фото удалено");
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
            <input type="file" accept="image/*" className="hidden" onChange={pickFile} disabled={uploading} />
          </label>
        </div>
      </header>

      {photos.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-muted-foreground">
          Альбом пока пуст. Поделитесь первой фотографией ❤️
        </div>
      ) : (
        <div className="pb-4">
          {groupByMonth(photos).map((g) => (
            <section key={g.label}>
              <h2 className="sticky top-[76px] z-10 bg-background/80 px-4 py-2 text-sm font-semibold capitalize text-muted-foreground backdrop-blur">{g.label}</h2>
              <div className="grid grid-cols-3 gap-1 px-1">
                {g.items.map((p, i) => (
                  <div key={p.id} className="group relative animate-float-in aspect-square" style={{ animationDelay: `${i * 20}ms` }}>
                    <button onClick={() => setViewing(photos.indexOf(p))}
                      className="h-full w-full overflow-hidden rounded-lg bg-muted active:opacity-80">
                      <img src={photoUrls[p.photo_url] ?? p.photo_url} alt={p.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
                    </button>
                    {p.user_id === user?.id && (
                      <button onClick={() => { if (confirm("Удалить фото?")) removePhoto(p); }} aria-label="Удалить фото"
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow-soft active:scale-95">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 animate-float-in" onClick={() => !uploading && setPending(null)}>
          <div className="safe-bottom w-full rounded-t-3xl bg-card p-5 shadow-warm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <img src={URL.createObjectURL(pending)} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <p className="text-sm text-muted-foreground">Добавьте подпись к фото</p>
            </div>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200}
              placeholder="Подпись (необязательно)" autoFocus
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-peach" />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setPending(null)} disabled={uploading}
                className="flex-1 rounded-2xl bg-muted py-3 text-sm font-medium active:scale-95">Отмена</button>
              <button onClick={upload} disabled={uploading}
                className="flex-1 rounded-2xl bg-[image:var(--gradient-peach)] py-3 text-sm font-semibold text-white shadow-warm active:scale-95 disabled:opacity-60">
                {uploading ? "Загрузка…" : "Опубликовать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing !== null && (
        <Lightbox
          images={photos.map((p) => ({
            url: photoUrls[p.photo_url] ?? p.photo_url,
            caption: [profiles[p.user_id]?.full_name, p.caption].filter(Boolean).join(" — "),
          }))}
          startIndex={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function groupByMonth(photos: Photo[]) {
  const groups: { label: string; items: Photo[] }[] = [];
  for (const p of photos) {
    const label = p.created_at ? new Date(p.created_at).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }) : "Без даты";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(p); else groups.push({ label, items: [p] });
  }
  return groups;
}
