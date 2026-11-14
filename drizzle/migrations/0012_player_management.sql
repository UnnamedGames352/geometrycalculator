CREATE TABLE IF NOT EXISTS public.player_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_id uuid,
  device_id text,
  reason text NOT NULL DEFAULT '',
  expires_at timestamptz,
  lifted_at timestamptz,
  actor_role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_moderation_target_check CHECK (friend_id IS NOT NULL OR device_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS player_moderation_friend_active_idx
  ON public.player_moderation (friend_id, expires_at) WHERE lifted_at IS NULL;
CREATE INDEX IF NOT EXISTS player_moderation_device_active_idx
  ON public.player_moderation (device_id, expires_at) WHERE lifted_at IS NULL;
ALTER TABLE public.player_moderation ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.player_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_id uuid,
  device_id text,
  player_name text NOT NULL DEFAULT 'Player',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  admin_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);
CREATE INDEX IF NOT EXISTS player_appeals_status_created_idx
  ON public.player_appeals (status, created_at DESC);
ALTER TABLE public.player_appeals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.player_message_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('player','online','all')),
  target_id uuid,
  target_label text NOT NULL DEFAULT '',
  message text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  actor_role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_message_history_created_idx
  ON public.player_message_history (created_at DESC);
ALTER TABLE public.player_message_history ENABLE ROW LEVEL SECURITY;
