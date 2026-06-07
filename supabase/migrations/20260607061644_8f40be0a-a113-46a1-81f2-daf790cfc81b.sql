
-- 1. conversation_members INSERT — restrict
DROP POLICY IF EXISTS "auth add members" ON public.conversation_members;
CREATE POLICY "add members"
  ON public.conversation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
    OR (
      user_id = auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversation_members.conversation_id)
    )
  );

-- 2. reactions — restrict to conversation members
DROP POLICY IF EXISTS "auth read reactions" ON public.reactions;
CREATE POLICY "members read reactions"
  ON public.reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = reactions.message_id
        AND public.is_member(m.conversation_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "auth add reaction" ON public.reactions;
CREATE POLICY "members add reaction"
  ON public.reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = reactions.message_id
        AND public.is_member(m.conversation_id, auth.uid())
    )
  );

-- 3. Trigger to guard message updates
CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    RAISE EXCEPTION 'Cannot change message ownership or conversation';
  END IF;
  IF OLD.user_id <> auth.uid() AND (
       NEW.content IS DISTINCT FROM OLD.content
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.media_url IS DISTINCT FROM OLD.media_url
       OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at
       OR NEW.link_preview IS DISTINCT FROM OLD.link_preview
       OR NEW.mention_user_ids IS DISTINCT FROM OLD.mention_user_ids
     ) THEN
    RAISE EXCEPTION 'Only the author can edit message content';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_message_update ON public.messages;
CREATE TRIGGER guard_message_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();
