import { MapPin, ExternalLink } from "lucide-react";

type Props = { lat: number; lng: number; address?: string | null; mine: boolean };

export function LocationMessage({ lat, lng, address, mine }: Props) {
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const embed = key
    ? `https://www.google.com/maps/embed/v1/view?key=${key}&center=${lat},${lng}&zoom=15`
    : null;
  const open = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <div className={`mt-0.5 overflow-hidden rounded-2xl border ${mine ? "border-white/30" : "border-border"}`}>
      {embed ? (
        <iframe
          src={embed}
          title="Местоположение"
          loading="lazy"
          className="block h-40 w-60 border-0"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="flex h-40 w-60 items-center justify-center bg-muted text-muted-foreground">
          <MapPin className="h-10 w-10" />
        </div>
      )}
      <a
        href={open}
        target="_blank"
        rel="noreferrer"
        className={`flex items-center gap-2 px-3 py-2 text-xs font-medium ${mine ? "bg-white/15 text-white" : "bg-muted/60"}`}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="line-clamp-1 flex-1">{address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}</span>
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    </div>
  );
}
