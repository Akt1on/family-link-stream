import { useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onCancel: () => void;
  onSend: (file: File) => Promise<void> | void;
};

const MAX_SECONDS = 15;

export function VideoRecorder({ onCancel, onSend }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 480, height: 480 },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : "video/webm";
        const rec = new MediaRecorder(stream, { mimeType: mime });
        chunksRef.current = [];
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.start();
        recorderRef.current = rec;
        const started = Date.now();
        tickRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          setSeconds(elapsed);
          if (elapsed >= MAX_SECONDS) stopAndSend();
        }, 200);
      } catch {
        toast.error("Нет доступа к камере");
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(tickRef.current);
      try { recorderRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAndSend = () => {
    const rec = recorderRef.current;
    if (!rec || busy) return;
    setBusy(true);
    clearInterval(tickRef.current);
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const file = new File([blob], "circle.webm", { type: "video/webm" });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      await onSend(file);
    };
    try { rec.stop(); } catch { setBusy(false); }
  };

  const cancel = () => {
    clearInterval(tickRef.current);
    try { recorderRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  };

  const progress = Math.min(1, seconds / MAX_SECONDS);
  const c = 2 * Math.PI * 46;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm animate-float-in px-6">
      <div className="relative h-64 w-64">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
          <circle
            cx="50" cy="50" r="46" fill="none"
            stroke="hsl(var(--destructive))" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.2s linear" }}
          />
        </svg>
        <div className="absolute inset-1.5 overflow-hidden rounded-full bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full -scale-x-100 object-cover" />
        </div>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-destructive px-3 py-0.5 text-xs font-bold text-white">
          ● {seconds}s / {MAX_SECONDS}s
        </div>
      </div>
      <p className="mt-6 text-sm text-white/80">Запишите видео-кружок до {MAX_SECONDS} секунд</p>
      <div className="mt-6 flex items-center gap-6">
        <button onClick={cancel} disabled={busy} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-95">
          <X className="h-6 w-6" />
        </button>
        <button onClick={stopAndSend} disabled={busy || seconds < 1} className="flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--gradient-peach)] text-white shadow-warm transition active:scale-95 disabled:opacity-50">
          <Send className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
