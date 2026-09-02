import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FAMILY_CHAT_NAME = "Семья ❤️";

/**
 * Makes sure the shared family group chat exists and that the signed-in user is a member.
 * Runs server-side with verified identity, so no SECURITY DEFINER function has to be
 * exposed to signed-in users through the public API.
 */
export const ensureFamilyChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("is_group", true)
      .eq("name", FAMILY_CHAT_NAME)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    let conversationId = existing?.id ?? null;

    if (!conversationId) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("conversations")
        .insert({ is_group: true, name: FAMILY_CHAT_NAME, created_by: userId })
        .select("id")
        .single();
      if (createErr || !created) throw new Error(createErr?.message ?? "Не удалось создать общий чат");
      conversationId = created.id;
    }

    const { error: memberErr } = await supabaseAdmin
      .from("conversation_members")
      .upsert({ conversation_id: conversationId, user_id: userId }, { onConflict: "conversation_id,user_id" });
    if (memberErr) throw new Error(memberErr.message);

    return { conversationId };
  });
