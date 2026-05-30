import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { ArrowLeft, Send, Mic, Image as ImageIcon, Smile, Phone, Pin, Square, X } from "lucide-react";
import { formatTime, isOnline } from "@/lib/utils-app";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat/$id")({ component: ChatPage });

type Profile = { id: string; full_name: string; avatar_url: string | null; last_seen: string | null };
type Message = {
  id: string; conversation_id: string; user_id: string; content: string | null; type: string;
  media_url: string | null; pinned: boolean; created_at: string | null;
};
type Reaction = { message_id: string; user_id: string; emoji: string };

const REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🎉"];

function ChatPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conv, setConv] = useState<{ name: string | null; is_group: boolean } | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [reactingOn, setReactingOn] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const profilesById = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      const [{ data: c }, { data: m }, { data: msgs }, { data: rs }] = await Promise.all([
        supabase.from("conversations").select("name, is_group").eq("id", id).maybeSingle(),
        supabase.from("conversation_members").select("user_id").eq("conversation_id", id),
        supabase.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(500),
        supabase.from("reactions").select("*"),
      ]);
      const memberIds = (m ?? []).map((x) => x.user_id);
      const { data: profs } = memberIds.length
        ? await supabase.from("profiles").select("*").in("id", memberIds)
        : { data: [] as Profile[] };
      if (!mounted) return;
      setConv(c);
      setMembers(profs ?? []);
      setMessages(msgs ?? []);
      const msgIds = new Set((msgs ?? []).map((x) => x.id));
      setReactions((rs ?? []).filter((r) => msgIds.has(r.message_id)));
    };
    load();

    const ch = supabase.channel(`chat-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => setMessages((m) => m.map((x) => x.id === (payload.new as Message).id ? payload.new as Message : x)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" },
        (payload) => setMessages((m) => m.filter((x) => x.id !== (payload.old as any).id)))
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, async () => {
        const { data: rs } = await supabase.from("reactions").select("*");
        const ids = new Set(messages.map((x) => x.id));
        setReactions((rs ?? []).filter((r) => ids.has(r.message_id)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "typing_indicators", filter: `conversation_id=eq.${id}` },
        async () => {
          const { data } = await supabase.from("typing_indicators").select("*").eq("conversation_id", id);
          const cutoff = Date.now() - 5000;
          setTypingIds((data ?? []).filter((t) => new Date(t.updated_at).getTime() > cutoff && t.user_id !== user.id).map((t) => t.user_id));
        })
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [id, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, typingIds.length]);

  const sendTyping = () => {
    if (!user) return;
    supabase.from("typing_indicators").upsert({ conversation_id: id, user_id: user.id, updated_at: new Date().toISOString() });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      supabase.from("typing_indicators").delete().eq("conversation_id", id).eq("user_id", user.id);
    }, 3000);
  };

  const send = async (overrides?: Partial<Message>) => {
    if (!user) return;
    const payload = {
      conversation_id: id,
      user_id: user.id,
      content: text.trim(),
      type: "text",
      ...overrides,
    };
    if (payload.type === "text" && !payload.content) return;
    setText("");
    const { error } = await supabase.from("messages").insert(payload);
    if (error) toast.error(error.message);
    supabase.from("typing_indicators").delete().eq("conversation_id", id).eq("user_id", user.id);
  };

  const uploadAndSend = async (file: File, type: "image" | "voice") => {
    if (!user) return;
    const ext = file.name.split(".").pop() || (type === "image" ? "jpg" : "webm");
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: { publicUrl } } = supabase.storage.from("media").getPublicUrl(path);
    await send({ type, media_url: publicUrl, content: "" });
  };

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await uploadAndSend(f, "image");
    e.target.value = "";
  };

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "voice.webm", { type: "audio/webm" });
        await uploadAndSend(file, "voice");
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Нет доступа к микрофону");
    }
  };
  const stopRecord = () => { recorderRef.current?.stop(); setRecording(false); };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user) return;
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === user.id && r.emoji === emoji);
    if (existing) {
      await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", user.id).eq("emoji", emoji);
    } else {
      await supabase.from("reactions").insert({ message_id: messageId, user_id: user.id, emoji });
    }
    setReactingOn(null);
  };

  const togglePin = async (m: Message) => {
    await supabase.from("messages").update({ pinned: !m.pinned }).eq("id", m.id);
  };

  const other = !conv?.is_group ? members.find((m) => m.id !== user?.id) : undefined;
  const title = conv?.is_group ? conv?.name : other?.full_name;
  const subtitle = conv?.is_group
    ? `${members.length} участников`
    : (other && isOnline(other.last_seen) ? "в сети" : "был(а) недавно");

  const pinned = messages.filter((m) => m.pinned);

  return (
    <div className="flex h-screen flex-col pb-0">
      <header className="safe-top sticky top-0 z-30 glass border-b border-border/40 px-3 py-3">
        <div className="flex items-center gap-3">
          <Link to="/chats" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {conv?.is_group ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white"><span>👨‍👩‍👧</span></div>
          ) : (
            <Avatar name={other?.full_name} url={other?.avatar_url} userId={other?.id} online={isOnline(other?.last_seen)} size={40} />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {typingIds.length > 0 ? <span className="text-primary">печатает<span className="typing-dot ml-1" /><span className="typing-dot" /><span className="typing-dot" /></span> : subtitle}
            </p>
          </div>
          <button onClick={() => navigate({ to: "/call/$id", params: { id } })} className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95">
            <Phone className="h-5 w-5" />
          </button>
        </div>
        {pinned.length > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-peach/30 px-3 py-2 text-xs">
            <Pin className="h-3.5 w-3.5 text-peach-foreground" />
            <span className="truncate"><strong>Закреплено:</strong> {pinned[pinned.length - 1].content || "медиа"}</span>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide">
        {messages.map((m, idx) => {
          const mine = m.user_id === user?.id;
          const prof = profilesById[m.user_id];
          const prev = messages[idx - 1];
          const showAvatar = !mine && (!prev || prev.user_id !== m.user_id);
          const msgReacts = reactions.filter((r) => r.message_id === m.id);
          const grouped = Object.entries(msgReacts.reduce<Record<string, number>>((acc, r) => { acc[r.emoji] = (acc[r.emoji] ?? 0) + 1; return acc; }, {}));
          return (
            <div key={m.id} className={`mb-1.5 flex animate-float-in items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && (showAvatar ? <Avatar name={prof?.full_name} url={prof?.avatar_url} userId={m.user_id} size={28} /> : <div className="w-7" />)}
              <div className="max-w-[78%]">
                {conv?.is_group && !mine && showAvatar && (
                  <p className="mb-0.5 ml-3 text-xs font-semibold text-muted-foreground">{prof?.full_name}</p>
                )}
                <button
                  onContextMenu={(e) => { e.preventDefault(); setReactingOn(m.id); }}
                  onDoubleClick={() => setReactingOn(m.id)}
                  className={`group relative block rounded-2xl px-3.5 py-2 text-left shadow-soft transition active:scale-[0.98] ${
                    mine ? "bg-bubble-me text-bubble-me-foreground rounded-br-sm" : "bg-bubble-them text-bubble-them-foreground rounded-bl-sm"
                  }`}
                >
                  {m.type === "image" && m.media_url && (
                    <img src={m.media_url} alt="" className="mb-1 max-h-72 rounded-xl object-cover" loading="lazy" />
                  )}
                  {m.type === "voice" && m.media_url && (
                    <audio src={m.media_url} controls className="w-56" />
                  )}
                  {m.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.content}</p>}
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                    {m.pinned && <Pin className="h-2.5 w-2.5" />}
                    <span>{m.created_at ? formatTime(m.created_at) : ""}</span>
                  </div>
                </button>
                {grouped.length > 0 && (
                  <div className="-mt-1 ml-2 flex flex-wrap gap-1">
                    {grouped.map(([emoji, count]) => (
                      <button key={emoji} onClick={() => toggleReaction(m.id, emoji)}
                        className="animate-pop flex items-center gap-0.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs shadow-soft">
                        <span>{emoji}</span><span className="text-muted-foreground">{count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {typingIds.length > 0 && (
          <div className="ml-9 flex items-center gap-1 text-primary">
            <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
          </div>
        )}
      </div>

      {reactingOn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-float-in" onClick={() => setReactingOn(null)}>
          <div className="flex gap-2 rounded-full bg-card p-2 shadow-warm" onClick={(e) => e.stopPropagation()}>
            {REACTIONS.map((e) => (
              <button key={e} onClick={() => toggleReaction(reactingOn, e)} className="rounded-full p-2 text-2xl transition hover:scale-125 active:scale-110">{e}</button>
            ))}
            <button onClick={() => { const msg = messages.find((m) => m.id === reactingOn); if (msg) togglePin(msg); setReactingOn(null); }}
              className="flex items-center justify-center rounded-full p-2 text-muted-foreground transition hover:scale-125">
              <Pin className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="safe-bottom sticky bottom-0 z-20 glass border-t border-border/40 px-3 py-2">
        {recording ? (
          <div className="flex items-center gap-3 rounded-full bg-destructive/10 px-4 py-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-destructive" />
            <span className="flex-1 text-sm">Запись…</span>
            <button onClick={stopRecord} className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><Square className="h-4 w-4" fill="currentColor" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground active:scale-95">
              <ImageIcon className="h-5 w-5" />
              <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            </label>
            <input
              value={text}
              onChange={(e) => { setText(e.target.value); sendTyping(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Сообщение…"
              className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 outline-none focus:border-primary"
            />
            {text.trim() ? (
              <button onClick={() => send()} className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95">
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={startRecord} className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white shadow-soft active:scale-95">
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
