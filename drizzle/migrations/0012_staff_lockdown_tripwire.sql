-- Separate ordinary browser bans from the site-wide emergency tripwire.
DROP TRIGGER IF EXISTS banned_devices_start_lockdown ON public.banned_devices;
DROP FUNCTION IF EXISTS public.broadcast_ban_lockdown();

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS lockdown_level smallint NOT NULL DEFAULT 1
  CHECK (lockdown_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS broadcast_message text;

UPDATE public.site_settings
SET lockdown_level = CASE WHEN lockdown THEN 5 ELSE 1 END;

-- Individual staff identities. Passwords are stored as salted scrypt hashes;
-- authenticator secrets are encrypted by the application before storage.
CREATE TABLE IF NOT EXISTS public.admin_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'moderator', 'support')),
  totp_secret_ciphertext text,
  totp_enabled boolean NOT NULL DEFAULT false,
  recovery_code_hashes text[] NOT NULL DEFAULT '{}',
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_staff_username_lower
  ON public.admin_staff (lower(username));
GRANT ALL ON public.admin_staff TO service_role;
ALTER TABLE public.admin_staff ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_sessions
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.admin_staff(id) ON DELETE CASCADE;

-- The emergency function is the only path that couples a device ban with
-- Level 5, a global session eviction, and an emergency player announcement.
CREATE OR REPLACE FUNCTION public.tripwire_emergency(p_device_id uuid, p_note text DEFAULT 'Confirmed tripwire violation')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE now_at timestamptz := clock_timestamp();
BEGIN
  INSERT INTO public.banned_devices(device_id, note)
  VALUES (p_device_id, left(p_note, 200))
  ON CONFLICT (device_id) DO UPDATE SET note = EXCLUDED.note;

  INSERT INTO public.site_settings(id, lockdown, lockdown_level, kick_all_at, broadcast_message)
  VALUES (1, true, 5, now_at, 'EMERGENCY LOCKDOWN — Security violation detected. All sessions have been terminated.')
  ON CONFLICT (id) DO UPDATE SET
    lockdown = true,
    lockdown_level = 5,
    kick_all_at = EXCLUDED.kick_all_at,
    broadcast_message = EXCLUDED.broadcast_message;

  UPDATE public.friend_passwords
  SET active_session = NULL,
      message = 'EMERGENCY LOCKDOWN — Security violation detected. All sessions have been terminated.',
      current_game = NULL,
      game_started_at = NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tripwire_emergency(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tripwire_emergency(uuid, text) TO service_role;
