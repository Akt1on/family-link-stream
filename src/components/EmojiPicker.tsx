import { useEffect, useRef, useState } from "react";

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "❤️ Любовь": [
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🖤", "💖", "💕",
    "💞", "💓", "💗", "💘", "💝", "💟", "♥️", "💌", "😍", "🥰",
    "😘", "💋", "💑", "👨‍👩‍👧‍👦", "👨‍👩‍👧", "👪", "🤱", "👶", "🍼", "🎀",
  ],
  "😀 Эмоции": [
    "😀", "😃", "😄", "😁", "😆", "🥲", "🥹", "😊", "🙂", "😉",
    "😇", "😎", "🤩", "🥳", "😋", "😜", "🤪", "🤗", "🤭", "🙃",
    "😴", "🥱", "😪", "😢", "😭", "😤", "😡", "🤬", "😱", "🤯",
    "😳", "🥺", "🥶", "🥵", "🤒", "🤧", "🤔", "🤨", "😏", "😬",
  ],
  "👋 Жесты": [
    "👍", "👎", "👏", "🙌", "👋", "🤝", "🙏", "🤞", "✌️", "🤟",
    "🤘", "👌", "🤌", "🤏", "✋", "🖐️", "🖖", "👊", "✊", "🫶",
    "🫰", "👐", "💪", "🫵", "🤲",
  ],
  "🎉 Праздник": [
    "🎉", "🎊", "🥳", "🎂", "🍰", "🧁", "🎁", "🎈", "🎀", "🪅",
    "🎆", "🎇", "✨", "⭐", "🌟", "💫", "🌈", "🎶", "🎵", "🍾",
    "🥂", "🍻", "🎤", "💃", "🕺", "🪩", "🎯", "🏆",
  ],
  "🌸 Природа": [
    "🌸", "🌺", "🌻", "🌷", "🌹", "🥀", "🌼", "💐", "🌱", "🌿",
    "🍀", "🍃", "🌳", "🌴", "🌵", "🌾", "☘️", "🌞", "🌝", "🌛",
    "🌜", "🌙", "⭐", "☀️", "⛅", "🌈", "❄️", "⛄", "🔥", "💧",
  ],
  "🍕 Еда": [
    "🍕", "🍔", "🍟", "🌭", "🥪", "🌮", "🌯", "🥗", "🍿", "🧂",
    "🥞", "🧇", "🥓", "🍳", "🍲", "🍝", "🍣", "🍙", "🍡", "🍦",
    "🍪", "🎂", "🍰", "🧁", "🍫", "🍬", "🍭", "🍯", "🍼", "☕",
    "🍵", "🥤", "🍹", "🍺",
  ],
  "🐾 Животные": [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
    "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦅",
    "🦉", "🦋", "🐢", "🐠", "🐳", "🦄", "🐝", "🐞", "🦔", "🦦",
  ],
};

const STICKERS = [
  "🥰", "😘", "🤗", "😻", "💖", "💕", "💝", "🌹", "🌸", "🌷",
  "🎀", "🎁", "🎂", "🎉", "🎊", "✨", "🌟", "🌈", "☀️", "🌙",
  "👨‍👩‍👧‍👦", "👪", "🍼", "🍰", "🥂", "🍾", "🤩", "🥳", "💃", "🕺",
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (e: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"emoji" | "stickers">("emoji");
  const [cat, setCat] = useState<string>(Object.keys(EMOJI_CATEGORIES)[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="animate-float-in absolute bottom-full left-2 right-2 mb-2 max-h-80 overflow-hidden rounded-3xl border border-border bg-card shadow-warm"
    >
      <div className="flex gap-1 border-b border-border/60 p-2">
        <button
          onClick={() => setTab("emoji")}
          className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition ${
            tab === "emoji" ? "bg-muted" : "text-muted-foreground"
          }`}
        >
          Эмодзи
        </button>
        <button
          onClick={() => setTab("stickers")}
          className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition ${
            tab === "stickers" ? "bg-muted" : "text-muted-foreground"
          }`}
        >
          Стикеры
        </button>
      </div>

      {tab === "emoji" ? (
        <>
          <div className="scrollbar-hide flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5">
            {Object.keys(EMOJI_CATEGORIES).map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                  cat === c ? "bg-[image:var(--gradient-peach)] text-white" : "bg-muted"
                }`}
              >
                {c.split(" ")[0]}
              </button>
            ))}
          </div>
          <div className="scrollbar-hide grid max-h-56 grid-cols-8 gap-1 overflow-y-auto p-2">
            {EMOJI_CATEGORIES[cat].map((e, i) => (
              <button
                key={`${e}-${i}`}
                onClick={() => onPick(e)}
                className="flex h-10 items-center justify-center rounded-xl text-2xl transition active:scale-90 hover:bg-muted"
              >
                {e}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="scrollbar-hide grid max-h-60 grid-cols-4 gap-2 overflow-y-auto p-3">
          {STICKERS.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s)}
              className="flex aspect-square items-center justify-center rounded-2xl bg-muted text-5xl transition active:scale-90 hover:scale-105 hover:bg-accent/30"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
