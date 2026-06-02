// Tiny haptic helper. No-op outside browsers / unsupported devices.
type Kind = "light" | "medium" | "heavy" | "success" | "warning";

const PATTERNS: Record<Kind, number | number[]> = {
  light: 8,
  medium: 14,
  heavy: 25,
  success: [10, 40, 10],
  warning: [20, 40, 20, 40],
};

export function haptic(kind: Kind = "light") {
  try {
    if (typeof window === "undefined") return;
    const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(PATTERNS[kind]);
  } catch {}
}
