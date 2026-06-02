export function ChatRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-2/5 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-muted/70" />
      </div>
    </div>
  );
}

export function ChatListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="px-3 py-2">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} style={{ animationDelay: `${i * 60}ms` }}>
          <ChatRowSkeleton />
        </li>
      ))}
    </ul>
  );
}
