import { useEffect, useRef, useState } from "react";
import { X, ZoomIn, Download } from "lucide-react";

export function Lightbox({
  images,
  startIndex = 0,
  onClose,
}: {
  images: { url: string; caption?: string | null }[];
  startIndex?: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const startRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastDistRef = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };
  const prev = () => {
    setIdx((i) => (i - 1 + images.length) % images.length);
    reset();
  };
  const next = () => {
    setIdx((i) => (i + 1) % images.length);
    reset();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDistRef.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1 && scale > 1) {
      startRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        tx,
        ty,
      };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      const next = Math.min(5, Math.max(1, scale * (d / lastDistRef.current)));
      setScale(next);
      lastDistRef.current = d;
    } else if (e.touches.length === 1 && startRef.current && scale > 1) {
      setTx(startRef.current.tx + (e.touches[0].clientX - startRef.current.x));
      setTy(startRef.current.ty + (e.touches[0].clientY - startRef.current.y));
    }
  };
  const onTouchEnd = () => {
    lastDistRef.current = null;
    startRef.current = null;
    if (scale <= 1) reset();
  };

  const current = images[idx];
  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 animate-float-in">
      <div className="safe-top flex items-center justify-between gap-3 p-3 text-white">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur active:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm opacity-80">
          {idx + 1} / {images.length}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setScale((s) => Math.min(5, s + 0.5))}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <a
            href={current.url}
            download
            target="_blank"
            rel="noreferrer"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          >
            <Download className="h-5 w-5" />
          </a>
        </div>
      </div>

      <div
        className="flex flex-1 select-none items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={() => (scale === 1 ? setScale(2) : reset())}
      >
        <img
          src={current.url}
          alt=""
          draggable={false}
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transition: lastDistRef.current ? "none" : "transform 0.2s",
          }}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="safe-bottom flex justify-between p-3 text-white">
          <button onClick={prev} className="rounded-full bg-white/10 px-5 py-2 text-sm backdrop-blur">
            ← Назад
          </button>
          <button onClick={next} className="rounded-full bg-white/10 px-5 py-2 text-sm backdrop-blur">
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}
