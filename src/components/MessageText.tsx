import { Fragment, useMemo } from "react";

type Props = {
  text: string;
  mentions?: Record<string, string>; // user_id -> full_name
  className?: string;
  mine?: boolean;
  highlight?: string;
};

const MENTION_RE = /@([A-Za-zА-Яа-яЁё0-9_\-]{2,30})/g;
const URL_RE = /(https?:\/\/[^\s]+)/gi;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MessageText({ text, mentions, className, mine, highlight }: Props) {
  const nameSet = useMemo(
    () => new Set(Object.values(mentions ?? {}).map((n) => n.split(/\s+/)[0]?.toLowerCase())),
    [mentions],
  );

  const tokens = useMemo(() => {
    type Tok = { type: "text" | "url" | "mention"; value: string };
    const out: Tok[] = [];
    const combined = new RegExp(`${URL_RE.source}|${MENTION_RE.source}`, "gi");
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = combined.exec(text)) !== null) {
      if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
      if (m[0].startsWith("@")) {
        const name = m[0].slice(1).toLowerCase();
        out.push({ type: nameSet.has(name) ? "mention" : "text", value: m[0] });
      } else {
        out.push({ type: "url", value: m[0] });
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ type: "text", value: text.slice(last) });
    return out;
  }, [text, nameSet]);

  const hl = highlight?.trim().toLowerCase();
  const renderText = (s: string, key: string) => {
    if (!hl || hl.length < 2) return <Fragment key={key}>{s}</Fragment>;
    const parts = s.split(new RegExp(`(${escapeRe(hl)})`, "ig"));
    return (
      <Fragment key={key}>
        {parts.map((p, i) =>
          p.toLowerCase() === hl ? (
            <mark key={i} className="rounded bg-yellow-300/70 px-0.5 text-foreground">{p}</mark>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          ),
        )}
      </Fragment>
    );
  };

  return (
    <p className={className ?? "whitespace-pre-wrap break-words text-[15px] leading-snug"}>
      {tokens.map((t, i) => {
        if (t.type === "url") {
          return (
            <a key={i} href={t.value} target="_blank" rel="noreferrer" className={`underline underline-offset-2 ${mine ? "text-white" : "text-primary"}`}>
              {t.value}
            </a>
          );
        }
        if (t.type === "mention") {
          return (
            <span key={i} className={`font-semibold ${mine ? "text-white" : "text-primary"}`}>
              {t.value}
            </span>
          );
        }
        return renderText(t.value, String(i));
      })}
    </p>
  );
}
