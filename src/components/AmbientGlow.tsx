/** Slow-drifting diffuse light behind content — the app's signature atmosphere. */
export function AmbientGlow({ subtle = false, intensity }: { subtle?: boolean; intensity?: number }) {
  const o = intensity ?? (subtle ? 0.55 : 1);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" style={{ opacity: o }}>
      <div className="ambient-orb ambient-orb-a" />
      <div className="ambient-orb ambient-orb-b" />
      <div className="grain absolute inset-0" />
    </div>
  );
}
