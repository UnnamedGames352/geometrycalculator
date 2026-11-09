CREATE TABLE public.banned_devices (device_id uuid PRIMARY KEY, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.banned_devices TO service_role;
ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_passwords ADD COLUMN device_id uuid;
ALTER TABLE public.activity_log ADD COLUMN device_id uuid;
ALTER TABLE public.activity_log ADD COLUMN device text;
ALTER TABLE public.activity_log ADD COLUMN attempted_input text;
CREATE TABLE public.device_failures (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, device_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.device_failures TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.device_failures_id_seq TO service_role;
ALTER TABLE public.device_failures ENABLE ROW LEVEL SECURITY;
CREATE INDEX device_failures_window ON public.device_failures(device_id,at);
COMMENT ON TABLE public.banned_ips IS 'DEPRECATED: browser bans now use public.banned_devices; IP addresses remain diagnostic only.';
CREATE FUNCTION public.record_device_failure(p_device_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE failures integer;
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(p_device_id::text,0));
INSERT INTO public.device_failures(device_id) VALUES (p_device_id);
SELECT count(*) INTO failures FROM public.device_failures WHERE device_id=p_device_id AND at >= now()-interval '5 minutes';
IF failures >= 3 THEN
INSERT INTO public.banned_devices(device_id,note) VALUES(p_device_id,'Auto-ban: 3 failed attempts') ON CONFLICT(device_id) DO UPDATE SET note=EXCLUDED.note;
RETURN true;
END IF;
RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.record_device_failure(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_device_failure(uuid) TO service_role;
CREATE FUNCTION public.evict_gate_users(p_lockdown boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
INSERT INTO public.site_settings(id,lockdown,kick_all_at) VALUES(1,coalesce(p_lockdown,false),clock_timestamp()) ON CONFLICT(id) DO UPDATE SET lockdown=coalesce(p_lockdown,site_settings.lockdown),kick_all_at=EXCLUDED.kick_all_at;
UPDATE public.friend_passwords SET active_session=NULL;
END; $$;
REVOKE ALL ON FUNCTION public.evict_gate_users(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evict_gate_users(boolean) TO service_role;