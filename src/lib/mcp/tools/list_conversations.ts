import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_conversations",
  title: "List conversations",
  description: "List the signed-in user's chats (direct and group) with basic metadata.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Max conversations to return (default 30)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const { data: memberRows, error: mErr } = await supabase
      .from("conversation_members")
      .select("conversation_id, pinned_at, archived_at")
      .eq("user_id", userId);
    if (mErr) return { content: [{ type: "text", text: mErr.message }], isError: true };
    const ids = (memberRows ?? []).map((r) => r.conversation_id);
    if (!ids.length) {
      return { content: [{ type: "text", text: "No conversations." }], structuredContent: { conversations: [] } };
    }
    const { data: convs, error: cErr } = await supabase
      .from("conversations")
      .select("id, name, is_group, created_at, created_by")
      .in("id", ids)
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (cErr) return { content: [{ type: "text", text: cErr.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(convs, null, 2) }],
      structuredContent: { conversations: convs ?? [] },
    };
  },
});
