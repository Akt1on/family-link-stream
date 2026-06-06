import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PUBLIC_VAPID_KEY =
  "BCasMHxqZXomO8oTWn8a6uxUBjzHwbRUGDancGiCI1wth70XsQYAJrhTLL0AlEpQWHxQoqFMxIJjmcb0enxYLJs";

export const sendChatPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        title: z.string().min(1).max(120),
        body: z.string().max(400).optional().default(""),
        url: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: members } = await supabaseAdmin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", data.conversation_id);

    if (!members?.some((m) => m.user_id === userId)) return { sent: 0 };

    const recipients = members
      .filter((m) => m.user_id !== userId)
      .map((m) => m.user_id);
    if (recipients.length === 0) return { sent: 0 };

    const { data: settings } = await supabaseAdmin
      .from("user_settings")
      .select("user_id, push_subscription, push_enabled")
      .in("user_id", recipients);

    const targets = (settings ?? []).filter(
      (s) => s.push_enabled && s.push_subscription,
    );
    if (targets.length === 0) return { sent: 0 };

    const subject = process.env.VAPID_SUBJECT;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!subject || !privateKey) {
      console.error("VAPID keys missing");
      return { sent: 0 };
    }

    const webpushMod = await import("web-push");
    const webpush = (webpushMod as any).default ?? webpushMod;
    webpush.setVapidDetails(subject, PUBLIC_VAPID_KEY, privateKey);

    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      url: data.url ?? `/chat/${data.conversation_id}`,
      tag: data.conversation_id,
    });

    let sent = 0;
    await Promise.all(
      targets.map(async (t) => {
        try {
          await webpush.sendNotification(t.push_subscription as any, payload);
          sent++;
        } catch (e: any) {
          const code = e?.statusCode;
          if (code === 404 || code === 410) {
            await supabaseAdmin
              .from("user_settings")
              .update({ push_subscription: null })
              .eq("user_id", t.user_id);
          } else {
            console.error("push send failed", code, e?.body);
          }
        }
      }),
    );
    return { sent };
  });
