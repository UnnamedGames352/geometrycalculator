-- Every newly created browser ban atomically starts a lockdown and invalidates
-- active player sessions. The existing service-role-only RPC owns the eviction.
CREATE OR REPLACE FUNCTION public.broadcast_ban_lockdown() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.evict_gate_users(true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.broadcast_ban_lockdown() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_ban_lockdown() TO service_role;

CREATE TRIGGER banned_devices_start_lockdown
AFTER INSERT ON public.banned_devices
FOR EACH ROW EXECUTE FUNCTION public.broadcast_ban_lockdown();
