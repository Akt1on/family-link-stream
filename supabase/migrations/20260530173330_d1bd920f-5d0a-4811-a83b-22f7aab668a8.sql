
-- Extend messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS link_preview jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- Message reads (delivery/read receipts)
CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.message_reads TO authenticated;
GRANT ALL ON public.message_reads TO service_role;

ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read receipts"
ON public.message_reads FOR SELECT TO authenticated
USING (public.is_member(conversation_id, auth.uid()));

CREATE POLICY "self insert receipt"
ON public.message_reads FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_member(conversation_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_message_reads_conv_user ON public.message_reads(conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages(conversation_id, created_at);

-- User settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY,
  theme text NOT NULL DEFAULT 'light',
  push_enabled boolean NOT NULL DEFAULT false,
  push_subscription jsonb,
  sound_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own settings read"
ON public.user_settings FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "own settings upsert"
ON public.user_settings FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "own settings update"
ON public.user_settings FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
