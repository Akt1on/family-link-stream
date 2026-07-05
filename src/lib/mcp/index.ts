import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listConversationsTool from "./tools/list_conversations";
import listRecentMessagesTool from "./tools/list_recent_messages";
import sendMessageTool from "./tools/send_message";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "family-messenger-mcp",
  title: "Family Messenger",
  version: "0.1.0",
  instructions:
    "Tools for the Family Messenger app. Read the signed-in user's conversations and recent messages, and send new text messages on their behalf. All access is scoped to the authenticated user via Supabase RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listConversationsTool, listRecentMessagesTool, sendMessageTool],
});
