import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

// Deterministic bar heights so server and client match
function fakeBars(seed: string, count = 32) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return 0.25 + ((h % 1000) / 1000) * 0.75;
  });
}

const SPEEDS = [1, 1.5, 2];

export function VoicePlayer({ url, mine }: { url: string; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const bars = useMemo(() => fakeBars(url, 36), [url]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setProgress(a.duration ? a.currentTime / a.duration : 0);
    };
    const onLoad = () => {
      const d = a.duration;
      if (isFinite(d)) setDuration(d);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoad);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoad);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.playbackRate = SPEEDS[speedIdx];
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * a.duration;
  };

  const time = playing && audioRef.current
    ? audioRef.current.currentTime
    : duration * progress;
  const totalMm = Math.floor((duration || 0) / 60);
  const totalSs = Math.floor((duration || 0) % 60);
  const curMm = Math.floor(time / 60);
  const curSs = Math.floor(time % 60);

  return (
    <div className="flex w-60 items-center gap-2 py-0.5">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button
        onClick={toggle}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-soft transition active:scale-90 ${
          mine ? "bg-white/30 text-current" : "bg-[image:var(--gradient-peach)] text-white"
        }`}
      >
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          onClick={seek}
          className="flex h-8 cursor-pointer items-center gap-[2px]"
        >
          {bars.map((h, i) => {
            const filled = i / bars.length < progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-all ${
                  filled ? "opacity-100" : "opacity-40"
                }`}
                style={{
                  height: `${Math.round(h * 100)}%`,
                  background: "currentColor",
                }}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] opacity-70">
          <span>
            {String(curMm).padStart(1, "0")}:{String(curSs).padStart(2, "0")}
            {duration > 0 && (
              <span className="opacity-60">
                {" "}/ {String(totalMm).padStart(1, "0")}:{String(totalSs).padStart(2, "0")}
              </span>
            )}
          </span>
          <button
            onClick={cycleSpeed}
            className="rounded-full bg-current/10 px-1.5 py-0 text-[10px] font-bold opacity-90"
          >
            {SPEEDS[speedIdx]}x
          </button>
        </div>
      </div>
    </div>
  );
}
