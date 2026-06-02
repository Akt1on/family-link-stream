
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS mention_user_ids UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS forwarded_from_conversation_id UUID;

-- members need to update their own row to pin/archive
DROP POLICY IF EXISTS "members update own membership" ON public.conversation_members;
CREATE POLICY "members update own membership"
ON public.conversation_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
