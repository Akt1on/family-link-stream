import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FAMILY_CHAT_NAME = "Семья ❤️";

/** Deterministic, unguessable invite code derived server-side from the family chat id. */
async function inviteCodeFor(conversationId: string): Promise<string> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_URL ?? "family";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${conversationId}:${secret}`));
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`.toUpperCase();
}

function normalize(code: string | undefined | null) {
  return (code ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
}

/**
 * Joins the shared family chat. The first user creates it; everyone else must
 * present the family invite code, so strangers who sign up cannot see the family.
 */
export const ensureFamilyChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invite?: string } | undefined) => ({ invite: typeof d?.invite === "string" ? d.invite.slice(0, 32) : undefined }))
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("conversations").select("id")
      .eq("is_group", true).eq("name", FAMILY_CHAT_NAME)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (findErr) throw new Error(findErr.message);

    let conversationId = existing?.id ?? null;

    if (!conversationId) {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("conversations")
        .insert({ is_group: true, name: FAMILY_CHAT_NAME, created_by: userId })
        .select("id").single();
      if (createErr || !created) throw new Error(createErr?.message ?? "Не удалось создать общий чат");
      conversationId = created.id;
    } else {
      const { data: member } = await supabaseAdmin
        .from("conversation_members").select("user_id")
        .eq("conversation_id", conversationId).eq("user_id", userId).maybeSingle();
      if (member) return { conversationId, needsInvite: false as const };
      const expected = normalize(await inviteCodeFor(conversationId));
      if (normalize(data.invite) !== expected) {
        return { conversationId: null, needsInvite: true as const, invalid: !!data.invite };
      }
    }

    const { error: memberErr } = await supabaseAdmin
      .from("conversation_members")
      .upsert({ conversation_id: conversationId, user_id: userId }, { onConflict: "conversation_id,user_id" });
    if (memberErr) throw new Error(memberErr.message);

    return { conversationId, needsInvite: false as const };
  });

/** Returns the family invite code — only to existing family members. */
export const getFamilyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("conversations").select("id")
      .eq("is_group", true).eq("name", FAMILY_CHAT_NAME)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!conv) return { code: null };
    const { data: member } = await supabaseAdmin
      .from("conversation_members").select("user_id")
      .eq("conversation_id", conv.id).eq("user_id", context.userId).maybeSingle();
    if (!member) return { code: null };
    return { code: await inviteCodeFor(conv.id) };
  });
