CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  key_hash text PRIMARY KEY,
  action text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_rate_limits_updated_idx
  ON public.security_rate_limits (updated_at);

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  category text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  device_id text,
  ip text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS security_alerts_status_created_idx
  ON public.security_alerts (status, created_at DESC);
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_security_rate_limit(
  p_key_hash text,
  p_action text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
) RETURNS TABLE(allowed boolean, attempts integer, retry_after_seconds integer, newly_blocked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
  v_window_started timestamptz;
  v_blocked_until timestamptz;
  v_now timestamptz := now();
  v_newly_blocked boolean := false;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 OR p_block_seconds < 1 OR length(p_key_hash) < 32 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_key_hash));
  SELECT attempt_count, window_started_at, blocked_until
    INTO v_count, v_window_started, v_blocked_until
    FROM public.security_rate_limits
    WHERE key_hash = p_key_hash
    FOR UPDATE;

  IF NOT FOUND THEN
    v_count := 1;
    v_window_started := v_now;
    v_blocked_until := NULL;
    INSERT INTO public.security_rate_limits (key_hash, action, attempt_count, window_started_at, updated_at)
    VALUES (p_key_hash, p_action, v_count, v_window_started, v_now);
  ELSIF v_blocked_until IS NOT NULL AND v_blocked_until > v_now THEN
    RETURN QUERY SELECT false, v_count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_blocked_until - v_now)))::integer), false;
    RETURN;
  ELSIF v_window_started <= v_now - make_interval(secs => p_window_seconds) THEN
    v_count := 1;
    v_window_started := v_now;
    v_blocked_until := NULL;
    UPDATE public.security_rate_limits
      SET action = p_action, attempt_count = v_count, window_started_at = v_window_started,
          blocked_until = NULL, updated_at = v_now
      WHERE key_hash = p_key_hash;
  ELSE
    v_count := v_count + 1;
    UPDATE public.security_rate_limits
      SET action = p_action, attempt_count = v_count, updated_at = v_now
      WHERE key_hash = p_key_hash;
  END IF;

  IF v_count > p_limit THEN
    v_blocked_until := v_now + make_interval(secs => p_block_seconds);
    v_newly_blocked := true;
    UPDATE public.security_rate_limits
      SET blocked_until = v_blocked_until, updated_at = v_now
      WHERE key_hash = p_key_hash;
  END IF;

  RETURN QUERY SELECT v_blocked_until IS NULL OR v_blocked_until <= v_now,
    v_count,
    CASE WHEN v_blocked_until IS NULL OR v_blocked_until <= v_now THEN 0
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_blocked_until - v_now)))::integer) END,
    v_newly_blocked;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_security_rate_limit(text,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_security_rate_limit(text,text,integer,integer,integer) TO service_role;
