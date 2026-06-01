import { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

export function VideoCircle({ url, mine }: { url: string; mine: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setProgress(v.duration ? v.currentTime / v.duration : 0);
    const onEnd = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const c = 2 * Math.PI * 46;

  return (
    <div className="relative h-44 w-44 select-none">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
        <circle
          cx="50" cy="50" r="46" fill="none"
          stroke={mine ? "white" : "hsl(var(--primary))"}
          strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      <button
        onClick={toggle}
        className="absolute inset-1.5 overflow-hidden rounded-full bg-black shadow-warm active:scale-95"
      >
        <video
          ref={videoRef}
          src={url}
          muted={muted}
          playsInline
          className="h-full w-full object-cover"
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="h-10 w-10 text-white drop-shadow" fill="white" />
          </div>
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setMuted((v) => !v); }}
        className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
      {playing && (
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="absolute bottom-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
        >
          <Pause className="h-3.5 w-3.5" fill="white" />
        </button>
      )}
    </div>
  );
}
