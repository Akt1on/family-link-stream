-- 1. Move is_member into a private (non-API) schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_member(_conv uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (select 1 from public.conversation_members where conversation_id=_conv and user_id=_user);
$$;

REVOKE ALL ON FUNCTION private.is_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_member(uuid, uuid) TO authenticated, service_role;

-- 2. Recreate all policies that referenced public.is_member
DROP POLICY IF EXISTS "members read conversations" ON public.conversations;
CREATE POLICY "members read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (private.is_member(id, auth.uid()));

DROP POLICY IF EXISTS "members update conversation" ON public.conversations;
CREATE POLICY "members update conversation" ON public.conversations FOR UPDATE TO authenticated
  USING (private.is_member(id, auth.uid()));

DROP POLICY IF EXISTS "members read members" ON public.conversation_members;
CREATE POLICY "members read members" ON public.conversation_members FOR SELECT TO authenticated
  USING (private.is_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated
  USING (private.is_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (private.is_member(conversation_id, auth.uid()) AND user_id = auth.uid());

DROP POLICY IF EXISTS "members update messages" ON public.messages;
CREATE POLICY "members update messages" ON public.messages FOR UPDATE TO authenticated
  USING (private.is_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members read typing" ON public.typing_indicators;
CREATE POLICY "members read typing" ON public.typing_indicators FOR SELECT TO authenticated
  USING (private.is_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members read receipts" ON public.message_reads;
CREATE POLICY "members read receipts" ON public.message_reads FOR SELECT TO authenticated
  USING (private.is_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "self insert receipt" ON public.message_reads;
CREATE POLICY "self insert receipt" ON public.message_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS "members read reactions" ON public.reactions;
CREATE POLICY "members read reactions" ON public.reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = reactions.message_id AND private.is_member(m.conversation_id, auth.uid())));

DROP POLICY IF EXISTS "members add reaction" ON public.reactions;
CREATE POLICY "members add reaction" ON public.reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = reactions.message_id AND private.is_member(m.conversation_id, auth.uid())));

DROP FUNCTION IF EXISTS public.is_member(uuid, uuid);

-- 3. Remove client-callable SECURITY DEFINER function; handled server-side now
DROP FUNCTION IF EXISTS public.ensure_family_chat();

-- Trigger-only definer functions should not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_message_update() FROM PUBLIC, anon, authenticated;

-- 4. Only the conversation creator may add members
DROP POLICY IF EXISTS "add members" ON public.conversation_members;
CREATE POLICY "creator adds members" ON public.conversation_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid()
  ));

-- 5. Storage: no anonymous reads of album / media
DROP POLICY IF EXISTS "public read album" ON storage.objects;
DROP POLICY IF EXISTS "public read media" ON storage.objects;

CREATE POLICY "auth read album obj" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'album');

CREATE POLICY "auth read media obj" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media');