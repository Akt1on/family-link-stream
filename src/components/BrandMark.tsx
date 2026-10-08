/** Monogram: two interlocking arcs — two people, one home. */
export function BrandMark({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-[30%] bg-primary/30 blur-xl" />
      <div className="lux-card relative flex h-full w-full items-center justify-center rounded-[30%]">
        <svg viewBox="0 0 48 48" width={size * 0.58} height={size * 0.58} fill="none" aria-hidden>
          <defs>
            <linearGradient id="bm-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="var(--gold-light)" />
              <stop offset="1" stopColor="var(--primary)" />
            </linearGradient>
          </defs>
          <path d="M8 30c0-9 6.5-16 14-16s10 6 10 12" stroke="url(#bm-g)" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M40 18c0 9-6.5 16-14 16s-10-6-10-12" stroke="url(#bm-g)" strokeWidth="3.2" strokeLinecap="round" opacity=".75" />
          <circle cx="24" cy="24" r="2.4" fill="var(--gold-light)" />
        </svg>
      </div>
    </div>
  );
}
