type Preview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};

export function LinkPreview({ preview, mine }: { preview: Preview; mine: boolean }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer"
      className={`mt-1.5 flex overflow-hidden rounded-2xl border ${
        mine ? "border-white/30 bg-white/15" : "border-border bg-muted/60"
      } transition hover:opacity-90`}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          className="h-20 w-20 shrink-0 object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="min-w-0 flex-1 p-2.5">
        {preview.siteName && (
          <div className="truncate text-[10px] uppercase tracking-wide opacity-70">
            {preview.siteName}
          </div>
        )}
        {preview.title && (
          <div className="line-clamp-2 text-sm font-semibold leading-tight">
            {preview.title}
          </div>
        )}
        {preview.description && (
          <div className="mt-0.5 line-clamp-2 text-xs opacity-80">
            {preview.description}
          </div>
        )}
      </div>
    </a>
  );
}
