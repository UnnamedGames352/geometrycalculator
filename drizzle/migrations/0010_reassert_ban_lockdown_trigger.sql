-- Reassert the ban-to-lockdown trigger in case the earlier 0007 migration
-- was skipped while its missing journal entry was being repaired.
CREATE OR REPLACE FUNCTION public.broadcast_ban_lockdown() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.evict_gate_users(true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_ban_lockdown() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_ban_lockdown() TO service_role;

DROP TRIGGER IF EXISTS banned_devices_start_lockdown ON public.banned_devices;
CREATE TRIGGER banned_devices_start_lockdown
AFTER INSERT ON public.banned_devices
FOR EACH ROW EXECUTE FUNCTION public.broadcast_ban_lockdown();
