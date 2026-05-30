import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({ url: z.string().url().max(2000) });

function pickMeta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeEntities(m2[1]);
  }
  return undefined;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export const fetchLinkPreview = createServerFn({ method: "POST" })
  .inputValidator((d) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 6000);
      const res = await fetch(data.url, {
        signal: ac.signal,
        headers: { "user-agent": "Mozilla/5.0 FamilyMessengerBot/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const ctype = res.headers.get("content-type") || "";
      if (!ctype.includes("text/html")) return null;
      const html = (await res.text()).slice(0, 200_000);
      const parsedUrl = new URL(data.url);
      const title =
        pickMeta(html, ["og:title", "twitter:title"]) ||
        html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
      const description = pickMeta(html, [
        "og:description",
        "twitter:description",
        "description",
      ]);
      let image = pickMeta(html, ["og:image", "twitter:image"]);
      if (image && !image.startsWith("http")) {
        try {
          image = new URL(image, parsedUrl).toString();
        } catch {
          image = undefined;
        }
      }
      const siteName =
        pickMeta(html, ["og:site_name"]) || parsedUrl.hostname.replace(/^www\./, "");
      return {
        url: data.url,
        title: title ? decodeEntities(title).slice(0, 200) : null,
        description: description ? description.slice(0, 300) : null,
        image: image ?? null,
        siteName,
      };
    } catch {
      return null;
    }
  });
