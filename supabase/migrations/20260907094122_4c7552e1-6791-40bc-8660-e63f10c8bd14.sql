-- Helper: do two users share at least one conversation?
CREATE OR REPLACE FUNCTION private.shares_conversation(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT _a IS NOT NULL AND _b IS NOT NULL AND (
    _a = _b OR EXISTS (
      SELECT 1
      FROM public.conversation_members ma
      JOIN public.conversation_members mb ON mb.conversation_id = ma.conversation_id
      WHERE ma.user_id = _a AND mb.user_id = _b
    )
  )
$$;

REVOKE ALL ON FUNCTION private.shares_conversation(uuid, uuid) FROM PUBLIC;

-- Profiles: only self and people sharing a conversation
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable by connected users"
ON public.profiles FOR SELECT TO authenticated
USING (private.shares_conversation(auth.uid(), id));

-- Album photos: owner and people sharing a conversation with the owner
DROP POLICY IF EXISTS "auth read album" ON public.album_photos;
CREATE POLICY "connected users read album"
ON public.album_photos FOR SELECT TO authenticated
USING (private.shares_conversation(auth.uid(), user_id));

-- Storage: album objects
DROP POLICY IF EXISTS "auth read album obj" ON storage.objects;
CREATE POLICY "connected users read album obj"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'album'
  AND private.shares_conversation(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid)
);

-- Storage: chat media objects
DROP POLICY IF EXISTS "auth read media obj" ON storage.objects;
CREATE POLICY "connected users read media obj"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'media'
  AND private.shares_conversation(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid)
);