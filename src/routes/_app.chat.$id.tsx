import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import {
  ArrowLeft, Send, Mic, Image as ImageIcon, Smile, Phone, Pin, Square, X,
  Reply, Check, CheckCheck, Video, MapPin, Plus, Search, Pencil, Trash2, Forward,
  ChevronDown,
} from "lucide-react";
import { formatTime, isOnline } from "@/lib/utils-app";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/EmojiPicker";
import { Lightbox } from "@/components/Lightbox";
import { VoicePlayer } from "@/components/VoicePlayer";
import { LinkPreview } from "@/components/LinkPreview";
import { VideoCircle } from "@/components/VideoCircle";
import { VideoRecorder } from "@/components/VideoRecorder";
import { LocationMessage } from "@/components/LocationMessage";
import { ForwardDialog } from "@/components/ForwardDialog";
import { MessageText } from "@/components/MessageText";
import { fetchLinkPreview } from "@/lib/og.functions";
import { haptic } from "@/lib/haptics";
import { cacheMessages, getCachedMessages } from "@/lib/offline-cache";

function parseGeo(url: string | null): { lat: number; lng: number } | null {
  if (!url) return null;
  const m = url.match(/^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]) } : null;
}

export const Route = createFileRoute("/_app/chat/$id")({
  component: ChatPage,
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
});

type Profile = { id: string; full_name: string; avatar_url: string | null; last_seen: string | null };
type LinkPreviewData = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};
type Message = {
  id: string; conversation_id: string; user_id: string; content: string | null; type: string;
  media_url: string | null; pinned: boolean; created_at: string | null;
  reply_to_id: string | null; link_preview: LinkPreviewData | null;
  edited_at?: string | null;
  mention_user_ids?: string[] | null;
  forwarded_from_conversation_id?: string | null;
};
type Reaction = { message_id: string; user_id: string; emoji: string };
type Read = { message_id: string; user_id: string };

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🎉"];
const URL_RE = /(https?:\/\/[^\s]+)/i;

function ChatPage() {
  const { id } = Route.useParams();
  const { q: initialQuery } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetchPreview = useServerFn(fetchLinkPreview);

  const [conv, setConv] = useState<{ name: string | null; is_group: boolean } | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [reactingOn, setReactingOn] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const swipeRef = useRef<{ id: string; startX: number; dx: number } | null>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [swipeDx, setSwipeDx] = useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [sendingLoc, setSendingLoc] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState<boolean>(!!initialQuery);
  const [searchTerm, setSearchTerm] = useState<string>(initialQuery ?? "");
  const [searchIdx, setSearchIdx] = useState<number>(0);
  const [mentionOpen, setMentionOpen] = useState<{ q: string; start: number } | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const textareaRef = useRef<HTMLInputElement>(null);

  const profilesById = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m])),
    [members],
  );
  const messagesById = useMemo(
    () => Object.fromEntries(messages.map((m) => [m.id, m])),
    [messages],
  );
  const imageMessages = useMemo(
    () => messages.filter((m) => m.type === "image" && m.media_url),
    [messages],
  );

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    // Hydrate from offline cache immediately
    const cached = getCachedMessages<Message>(id);
    if (cached && cached.length) setMessages(cached);

    const load = async () => {
      const [{ data: c }, { data: m }, { data: msgs }] = await Promise.all([
        supabase.from("conversations").select("name, is_group").eq("id", id).maybeSingle(),
        supabase.from("conversation_members").select("user_id").eq("conversation_id", id),
        supabase.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(500),
      ]);
      const memberIds = (m ?? []).map((x) => x.user_id);
      const msgIds = (msgs ?? []).map((x) => x.id);
      const [{ data: profs }, { data: rs }, { data: rd }] = await Promise.all([
        memberIds.length
          ? supabase.from("profiles").select("*").in("id", memberIds)
          : Promise.resolve({ data: [] as Profile[] } as any),
        msgIds.length
          ? supabase.from("reactions").select("*").in("message_id", msgIds)
          : Promise.resolve({ data: [] as Reaction[] } as any),
        supabase.from("message_reads").select("message_id, user_id").eq("conversation_id", id),
      ]);
      if (!mounted) return;
      if (c) setConv(c);
      setMembers(profs ?? []);
      const list = (msgs ?? []) as Message[];
      setMessages(list);
      setReads((rd ?? []) as Read[]);
      setReactions((rs ?? []) as Reaction[]);
      cacheMessages(id, list);
    };
    load();


    const ch = supabase.channel(`chat-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        (payload) => setMessages((m) => m.map((x) => x.id === (payload.new as Message).id ? payload.new as Message : x)))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" },
        (payload) => setMessages((m) => m.filter((x) => x.id !== (payload.old as any).id)))
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, (payload) => {
        const evt = payload.eventType;
        const row = (payload.new ?? payload.old) as Reaction;
        if (!row?.message_id) return;
        setReactions((prev) => {
          if (evt === "DELETE") {
            return prev.filter((x) => !(x.message_id === row.message_id && x.user_id === row.user_id && x.emoji === row.emoji));
          }
          if (prev.some((x) => x.message_id === row.message_id && x.user_id === row.user_id && x.emoji === row.emoji)) return prev;
          return [...prev, row];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads", filter: `conversation_id=eq.${id}` },
        (payload) => {
          const r = payload.new as Read;
          setReads((prev) => (prev.some((x) => x.message_id === r.message_id && x.user_id === r.user_id) ? prev : [...prev, r]));
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

  // Mark visible messages as read
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unread = messages.filter(
      (m) => m.user_id !== user.id &&
        !reads.some((r) => r.message_id === m.id && r.user_id === user.id),
    );
    if (unread.length === 0) return;
    const rows = unread.map((m) => ({
      message_id: m.id,
      user_id: user.id,
      conversation_id: id,
    }));
    supabase.from("message_reads").insert(rows).then(() => {});
    setReads((prev) => [
      ...prev,
      ...unread.map((m) => ({ message_id: m.id, user_id: user.id })),
    ]);
  }, [messages, user?.id, id]);

  // Smart auto-scroll: only when user is near the bottom
  // Persist messages to offline cache (debounced by render batching)
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => cacheMessages(id, messages), 400);
    return () => clearTimeout(t);
  }, [messages, id]);

  const prevLenRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (isAtBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      setNewCount(0);
    } else if (grew) {
      const last = messages[messages.length - 1];
      if (last && last.user_id !== user?.id) setNewCount((c) => c + 1);
    }
  }, [messages.length, typingIds.length, isAtBottom, user?.id]);

  // Track if at bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setIsAtBottom(atBottom);
      if (atBottom) setNewCount(0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Search navigation: jump to matches
  const searchMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (q.length < 2) return [];
    return messages.filter((m) => (m.content ?? "").toLowerCase().includes(q));
  }, [messages, searchTerm]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const idx = Math.min(searchIdx, searchMatches.length - 1);
    const el = messageRefs.current[searchMatches[idx].id];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchIdx, searchMatches]);

  useEffect(() => { setSearchIdx(0); }, [searchTerm]);


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
    const content = overrides?.content ?? text.trim();
    const mentionIds: string[] = [];
    if ((overrides?.type ?? "text") === "text" && content) {
      const re = /@([A-Za-zА-Яа-яЁё0-9_\-]{2,30})/g;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(content)) !== null) {
        const name = mm[1].toLowerCase();
        const hit = members.find((p) => p.id !== user.id && p.full_name.split(/\s+/)[0]?.toLowerCase() === name);
        if (hit && !mentionIds.includes(hit.id)) mentionIds.push(hit.id);
      }
    }
    const payload: any = {
      conversation_id: id,
      user_id: user.id,
      content,
      type: overrides?.type ?? "text",
      media_url: overrides?.media_url ?? null,
      reply_to_id: replyTo?.id ?? null,
      mention_user_ids: mentionIds,
    };
    if (payload.type === "text" && !payload.content) return;
    setText("");
    setReplyTo(null);
    setEmojiOpen(false);
    setMentionOpen(null);

    // Detect link and pre-attach preview
    if (payload.type === "text") {
      const m = (content as string).match(URL_RE);
      if (m) {
        try {
          const preview = await fetchPreview({ data: { url: m[1] } });
          if (preview) payload.link_preview = preview;
        } catch {}
      }
    }

    const { error } = await supabase.from("messages").insert(payload);
    if (error) toast.error(error.message);
    haptic("light");
    supabase.from("typing_indicators").delete().eq("conversation_id", id).eq("user_id", user.id);

    // Fire-and-forget push notifications to other members
    try {
      const { sendChatPush } = await import("@/lib/push.functions");
      const myName =
        members.find((m) => m.id === user.id)?.full_name?.split(/\s+/)[0] ??
        "Семья";
      const preview =
        payload.type === "image" ? "📷 Фотография" :
        payload.type === "voice" ? "🎤 Голосовое" :
        payload.type === "video_circle" ? "⭕ Видео-кружок" :
        payload.type === "location" ? "📍 Геолокация" :
        (payload.content || "");
      void sendChatPush({
        data: {
          conversation_id: id,
          title: conv?.is_group ? `${myName} · ${conv.name ?? "Группа"}` : myName,
          body: preview.slice(0, 200),
          url: `/chat/${id}`,
        },
      });
    } catch {}
  };

  // @mention autocomplete detection
  const onTextChange = (val: string, caret: number) => {
    setText(val);
    sendTyping();
    const before = val.slice(0, caret);
    const m = before.match(/(?:^|\s)@([A-Za-zА-Яа-яЁё0-9_\-]{0,30})$/);
    if (m && conv?.is_group) {
      setMentionOpen({ q: m[1].toLowerCase(), start: caret - m[1].length - 1 });
    } else {
      setMentionOpen(null);
    }
  };

  const pickMention = (p: Profile) => {
    if (!mentionOpen) return;
    const first = p.full_name.split(/\s+/)[0] ?? "user";
    const before = text.slice(0, mentionOpen.start);
    const after = text.slice(mentionOpen.start + 1 + mentionOpen.q.length);
    setText(`${before}@${first} ${after}`);
    setMentionOpen(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const mentionMatches = useMemo(() => {
    if (!mentionOpen) return [];
    return members
      .filter((p) => p.id !== user?.id)
      .filter((p) => !mentionOpen.q || p.full_name.toLowerCase().includes(mentionOpen.q))
      .slice(0, 6);
  }, [mentionOpen, members, user?.id]);

  const uploadAndSend = async (file: File, type: "image" | "voice" | "video") => {
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

  const shareLocation = async () => {
    if (!user || sendingLoc) return;
    if (!navigator.geolocation) { toast.error("Геолокация не поддерживается"); return; }
    setSendingLoc(true);
    setAttachOpen(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let address = "";
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&accept-language=ru`,
            { headers: { "Accept": "application/json" } },
          );
          const data = await r.json();
          address = data?.display_name ?? "";
        } catch {}
        await send({
          type: "location",
          media_url: `geo:${latitude},${longitude}`,
          content: address,
        });
        setSendingLoc(false);
      },
      () => { toast.error("Не удалось получить геолокацию"); setSendingLoc(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
    haptic("light");
    await supabase.from("messages").update({ pinned: !m.pinned }).eq("id", m.id);
  };

  const startEdit = (m: Message) => {
    if (m.user_id !== user?.id) return;
    haptic("light");
    setEditingId(m.id);
    setText(m.content ?? "");
    setReplyTo(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const cancelEdit = () => { setEditingId(null); setText(""); };

  const saveEdit = async () => {
    if (!editingId) return;
    const content = text.trim();
    if (!content) return;
    const { error } = await supabase.from("messages")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    haptic("success");
    cancelEdit();
  };

  const deleteMessage = async (m: Message) => {
    if (m.user_id !== user?.id) return;
    if (!confirm("Удалить сообщение?")) return;
    haptic("warning");
    const { error } = await supabase.from("messages").delete().eq("id", m.id);
    if (error) toast.error(error.message);
  };

  // Swipe to reply (touch)
  const onTouchStart = (m: Message) => (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    swipeRef.current = { id: m.id, startX: e.touches[0].clientX, dx: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const dx = e.touches[0].clientX - swipeRef.current.startX;
    const clamped = Math.max(-80, Math.min(80, dx));
    swipeRef.current.dx = clamped;
    setSwipeId(swipeRef.current.id);
    setSwipeDx(clamped);
  };
  const onTouchEnd = () => {
    const s = swipeRef.current;
    if (s && Math.abs(s.dx) > 50) {
      const msg = messagesById[s.id];
      if (msg) setReplyTo(msg);
    }
    swipeRef.current = null;
    setSwipeId(null);
    setSwipeDx(0);
  };

  const other = !conv?.is_group ? members.find((m) => m.id !== user?.id) : undefined;
  const title = conv?.is_group ? conv?.name : other?.full_name;
  const subtitle = conv?.is_group
    ? `${members.length} участников`
    : (other && isOnline(other.last_seen) ? "в сети" : "был(а) недавно");

  const pinned = messages.filter((m) => m.pinned);
  const otherMemberIds = members.filter((m) => m.id !== user?.id).map((m) => m.id);

  const readsByMsg = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const r of reads) {
      if (!map[r.message_id]) map[r.message_id] = new Set();
      map[r.message_id].add(r.user_id);
    }
    return map;
  }, [reads]);

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
          <button
            onClick={() => { haptic("light"); setShowSearch((v) => !v); if (showSearch) setSearchTerm(""); }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted active:scale-95"
            aria-label="Поиск"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate({ to: "/call/$id", params: { id }, search: { mode: "video" } })}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white shadow-soft active:scale-95"
            aria-label="Видеозвонок"
          >
            <Video className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate({ to: "/call/$id", params: { id }, search: { mode: "audio" } })}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95"
            aria-label="Аудиозвонок"
          >
            <Phone className="h-5 w-5" />
          </button>
        </div>
        {showSearch && (
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск в чате"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {searchMatches.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {searchIdx + 1}/{searchMatches.length}
              </span>
            )}
            <button
              disabled={searchMatches.length === 0}
              onClick={() => setSearchIdx((i) => (i - 1 + searchMatches.length) % searchMatches.length)}
              className="px-1 text-sm disabled:opacity-30"
            >↑</button>
            <button
              disabled={searchMatches.length === 0}
              onClick={() => setSearchIdx((i) => (i + 1) % searchMatches.length)}
              className="px-1 text-sm disabled:opacity-30"
            >↓</button>
            <button onClick={() => { setShowSearch(false); setSearchTerm(""); }} className="text-muted-foreground"><X className="h-4 w-4" /></button>
          </div>
        )}
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
          const replied = m.reply_to_id ? messagesById[m.reply_to_id] : null;
          const repliedProf = replied ? profilesById[replied.user_id] : null;
          const readSet = readsByMsg[m.id];
          const isRead = mine && otherMemberIds.length > 0 && otherMemberIds.every((uid) => readSet?.has(uid));

          const offset = swipeId === m.id ? swipeDx : 0;
          const showReplyHint = Math.abs(offset) > 30;

          return (
            <div
              key={m.id}
              ref={(el) => { messageRefs.current[m.id] = el; }}
              className={`mb-1.5 flex animate-float-in items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
              onTouchStart={onTouchStart(m)}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{
                transform: `translateX(${offset}px)`,
                transition: swipeId === m.id ? "none" : "transform 0.2s",
              }}
            >
              {!mine && (showAvatar ? <Avatar name={prof?.full_name} url={prof?.avatar_url} userId={m.user_id} size={28} /> : <div className="w-7" />)}
              <div className="relative max-w-[78%]">
                {showReplyHint && (
                  <div className={`absolute top-1/2 -translate-y-1/2 ${mine ? "-left-10" : "-right-10"} flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary`}>
                    <Reply className="h-4 w-4" />
                  </div>
                )}
                {conv?.is_group && !mine && showAvatar && (
                  <p className="mb-0.5 ml-3 text-xs font-semibold text-muted-foreground">{prof?.full_name}</p>
                )}
                <div
                  onContextMenu={(e) => { e.preventDefault(); setReactingOn(m.id); }}
                  onDoubleClick={() => setReactingOn(m.id)}
                  className={`group relative block rounded-2xl px-3 py-2 text-left shadow-soft transition ${
                    mine ? "bg-bubble-me text-bubble-me-foreground rounded-br-sm" : "bg-bubble-them text-bubble-them-foreground rounded-bl-sm"
                  }`}
                >
                  {replied && (
                    <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${mine ? "border-white/60 bg-white/15" : "border-primary/70 bg-primary/10"}`}>
                      <div className="font-semibold opacity-90">{repliedProf?.full_name ?? "Сообщение"}</div>
                      <div className="truncate opacity-80">
                        {replied.type === "image" ? "📷 Фотография"
                          : replied.type === "voice" ? "🎤 Голосовое"
                          : replied.type === "video" ? "🎥 Видео-кружок"
                          : replied.type === "location" ? "📍 Геолокация"
                          : replied.content}
                      </div>
                    </div>
                  )}
                  {m.type === "image" && m.media_url && (
                    <button
                      onClick={() => {
                        const i = imageMessages.findIndex((x) => x.id === m.id);
                        setLightboxIdx(i >= 0 ? i : 0);
                      }}
                      className="mb-1 block overflow-hidden rounded-xl"
                    >
                      <img src={m.media_url} alt="" className="max-h-72 w-full object-cover transition hover:opacity-95" loading="lazy" />
                    </button>
                  )}
                  {m.type === "voice" && m.media_url && (
                    <VoicePlayer url={m.media_url} mine={mine} />
                  )}
                  {m.type === "video" && m.media_url && (
                    <VideoCircle url={m.media_url} mine={mine} />
                  )}
                  {m.type === "location" && (() => {
                    const geo = parseGeo(m.media_url);
                    return geo ? <LocationMessage lat={geo.lat} lng={geo.lng} address={m.content} mine={mine} /> : null;
                  })()}
                  {m.type !== "location" && m.content && (
                    <MessageText
                      text={m.content}
                      mine={mine}
                      mentions={Object.fromEntries(members.map((mm) => [mm.id, mm.full_name]))}
                      highlight={searchTerm.trim().length >= 2 ? searchTerm.trim() : undefined}
                    />
                  )}
                  {m.edited_at && <span className="ml-1 text-[10px] opacity-60">(изменено)</span>}
                  {m.link_preview && <LinkPreview preview={m.link_preview} mine={mine} />}
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                    {m.pinned && <Pin className="h-2.5 w-2.5" />}
                    <span>{m.created_at ? formatTime(m.created_at) : ""}</span>
                    {mine && (
                      isRead
                        ? <CheckCheck className="h-3 w-3 text-primary" />
                        : <Check className="h-3 w-3" />
                    )}
                  </div>
                </div>
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
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-card p-3 shadow-warm" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2">
              {QUICK_REACTIONS.map((e) => (
                <button key={e} onClick={() => toggleReaction(reactingOn, e)} className="rounded-full p-2 text-2xl transition hover:scale-125 active:scale-110">{e}</button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-2 border-t border-border pt-2">
              <button
                onClick={() => { const msg = messagesById[reactingOn]; if (msg) setReplyTo(msg); setReactingOn(null); }}
                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold"
              >
                <Reply className="h-4 w-4" /> Ответить
              </button>
              <button
                onClick={() => { const msg = messagesById[reactingOn]; if (msg) togglePin(msg); setReactingOn(null); }}
                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold"
              >
                <Pin className="h-4 w-4" /> Закрепить
              </button>
              <button
                onClick={() => { const msg = messagesById[reactingOn]; if (msg) setForwardMsg(msg); setReactingOn(null); }}
                className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold"
              >
                <Forward className="h-4 w-4" /> Переслать
              </button>
              {(() => {
                const msg = messagesById[reactingOn];
                if (!msg || msg.user_id !== user?.id) return null;
                return (
                  <>
                    {msg.type === "text" && (
                      <button
                        onClick={() => { startEdit(msg); setReactingOn(null); }}
                        className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold"
                      >
                        <Pencil className="h-4 w-4" /> Изменить
                      </button>
                    )}
                    <button
                      onClick={() => { deleteMessage(msg); setReactingOn(null); }}
                      className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Удалить
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {lightboxIdx !== null && (
        <Lightbox
          images={imageMessages.map((m) => ({ url: m.media_url!, caption: m.content }))}
          startIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}

      {!isAtBottom && newCount > 0 && (
        <button
          onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }}
          className="fixed bottom-24 right-4 z-30 flex items-center gap-1.5 rounded-full bg-[image:var(--gradient-peach)] px-3 py-2 text-sm font-semibold text-white shadow-warm animate-float-in active:scale-95"
        >
          <ChevronDown className="h-4 w-4" />
          {newCount} {newCount === 1 ? "новое" : "новых"}
        </button>
      )}

      <div className="safe-bottom sticky bottom-0 z-20 glass border-t border-border/40 px-3 py-2">
        {editingId && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border-l-2 border-peach-foreground bg-peach/30 px-3 py-2 text-xs">
            <Pencil className="h-3.5 w-3.5 text-peach-foreground" />
            <span className="flex-1 font-semibold text-peach-foreground">Редактирование</span>
            <button onClick={cancelEdit} className="text-peach-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {replyTo && !editingId && (
          <div className="mb-2 flex items-start gap-2 rounded-2xl border-l-2 border-primary bg-primary/10 px-3 py-2">
            <Reply className="mt-0.5 h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-semibold text-primary">Ответ — {profilesById[replyTo.user_id]?.full_name}</div>
              <div className="truncate opacity-80">
                {replyTo.type === "image" ? "📷 Фотография"
                  : replyTo.type === "voice" ? "🎤 Голосовое"
                  : replyTo.type === "video" ? "🎥 Видео-кружок"
                  : replyTo.type === "location" ? "📍 Геолокация"
                  : replyTo.content}
              </div>
            </div>
            <button onClick={() => setReplyTo(null)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {recording ? (
          <div className="flex items-center gap-3 rounded-full bg-destructive/10 px-4 py-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-destructive animate-ring" />
            <span className="flex-1 text-sm">Запись…</span>
            <button onClick={stopRecord} className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground"><Square className="h-4 w-4" fill="currentColor" /></button>
          </div>
        ) : (
          <div className="relative flex items-center gap-2">
            {mentionOpen && mentionMatches.length > 0 && (
              <div className="absolute bottom-12 left-12 right-12 z-30 max-h-56 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-warm animate-float-in">
                {mentionMatches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => pickMention(p)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <Avatar name={p.full_name} url={p.avatar_url} userId={p.id} size={28} />
                    <span className="truncate font-medium">{p.full_name}</span>
                  </button>
                ))}
              </div>
            )}
            {emojiOpen && (
              <EmojiPicker
                onPick={(e) => setText((t) => t + e)}
                onClose={() => setEmojiOpen(false)}
              />
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 ${attachOpen ? "rotate-45 bg-[image:var(--gradient-sky)] text-white" : "bg-muted text-muted-foreground"}`}
              >
                <Plus className="h-5 w-5" />
              </button>
              {attachOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
                  <div className="absolute bottom-12 left-0 z-20 flex w-44 flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-warm animate-float-in">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-muted">
                      <ImageIcon className="h-4 w-4 text-primary" /> Фото
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { setAttachOpen(false); onPickImage(e); }} />
                    </label>
                    <button
                      onClick={() => { setAttachOpen(false); setVideoOpen(true); }}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted"
                    >
                      <Video className="h-4 w-4 text-peach-foreground" /> Видео-кружок
                    </button>
                    <button
                      onClick={shareLocation}
                      disabled={sendingLoc}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted disabled:opacity-60"
                    >
                      <MapPin className="h-4 w-4 text-destructive" /> {sendingLoc ? "Поиск…" : "Геолокация"}
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 ${emojiOpen ? "bg-[image:var(--gradient-peach)] text-white" : "bg-muted text-muted-foreground"}`}
            >
              <Smile className="h-5 w-5" />
            </button>
            <input
              ref={textareaRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editingId) saveEdit(); else send();
                } else if (e.key === "Escape" && editingId) {
                  cancelEdit();
                }
              }}
              placeholder={editingId ? "Изменить сообщение…" : replyTo ? "Ваш ответ…" : "Сообщение…"}
              className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 outline-none focus:border-primary"
            />
            {text.trim() ? (
              <button
                onClick={() => editingId ? saveEdit() : send()}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm active:scale-95"
              >
                {editingId ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </button>
            ) : (
              <button onClick={startRecord} className="flex h-10 w-10 items-center justify-center rounded-full bg-[image:var(--gradient-sky)] text-white shadow-soft active:scale-95">
                <Mic className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {videoOpen && (
        <VideoRecorder
          onCancel={() => setVideoOpen(false)}
          onSend={async (file) => {
            setVideoOpen(false);
            await uploadAndSend(file, "video");
          }}
        />
      )}

      {forwardMsg && (
        <ForwardDialog message={forwardMsg} onClose={() => setForwardMsg(null)} />
      )}
    </div>
  );
}
