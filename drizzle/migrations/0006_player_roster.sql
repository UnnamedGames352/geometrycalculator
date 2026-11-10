ALTER TABLE public.friend_passwords
  ADD COLUMN IF NOT EXISTS screen_size text,
  ADD COLUMN IF NOT EXISTS cpu_cores integer,
  ADD COLUMN IF NOT EXISTS device_memory_gb numeric,
  ADD COLUMN IF NOT EXISTS browser_version text,
  ADD COLUMN IF NOT EXISTS playtime_seconds bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS game_playtime jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_note text NOT NULL DEFAULT '';

-- Keep roster data private: only the service role may read or write friend records.
GRANT ALL ON public.friend_passwords TO service_role;
ALTER TABLE public.friend_passwords ENABLE ROW LEVEL SECURITY;

-- Each game transition atomically adds elapsed time to the previous game and total.
CREATE OR REPLACE FUNCTION public.track_friend_game_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elapsed bigint;
  previous_game text;
  previous_seconds bigint;
BEGIN
  IF OLD.current_game IS NOT NULL AND OLD.game_started_at IS NOT NULL
     AND OLD.current_game IS DISTINCT FROM NEW.current_game THEN
    elapsed := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - OLD.game_started_at)))::bigint);
    previous_game := OLD.current_game;
    previous_seconds := COALESCE((OLD.game_playtime ->> previous_game)::bigint, 0);
    NEW.playtime_seconds := COALESCE(OLD.playtime_seconds, 0) + elapsed;
    NEW.game_playtime := COALESCE(OLD.game_playtime, '{}'::jsonb)
      || jsonb_build_object(previous_game, previous_seconds + elapsed);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friend_game_time_before_change ON public.friend_passwords;
CREATE TRIGGER friend_game_time_before_change
  BEFORE UPDATE OF current_game ON public.friend_passwords
  FOR EACH ROW EXECUTE FUNCTION public.track_friend_game_time();

-- Browser-provided measurements are informational and bounded. This RPC is
-- service-role-only; the application verifies the encrypted session first.
CREATE OR REPLACE FUNCTION public.capture_player_profile(
  p_friend_id uuid,
  p_screen_size text,
  p_cpu_cores integer,
  p_device_memory_gb numeric,
  p_browser_version text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.friend_passwords
  SET screen_size = p_screen_size,
      cpu_cores = p_cpu_cores,
      device_memory_gb = p_device_memory_gb,
      browser_version = p_browser_version
  WHERE id = p_friend_id;
$$;

CREATE OR REPLACE FUNCTION public.save_player_admin_note(p_friend_id uuid, p_note text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.friend_passwords
  SET admin_note = LEFT(COALESCE(p_note, ''), 500)
  WHERE id = p_friend_id;
$$;

REVOKE ALL ON FUNCTION public.track_friend_game_time() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_player_profile(uuid, text, integer, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_player_admin_note(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_friend_game_time() TO service_role;
GRANT EXECUTE ON FUNCTION public.capture_player_profile(uuid, text, integer, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_player_admin_note(uuid, text) TO service_role;
