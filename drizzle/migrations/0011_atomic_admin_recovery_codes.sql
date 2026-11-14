CREATE OR REPLACE FUNCTION public.consume_admin_recovery_code(p_code_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_codes text[];
BEGIN
  SELECT recovery_code_hashes INTO current_codes
  FROM public.admin_security
  WHERE id = 1
  FOR UPDATE;

  IF current_codes IS NULL OR NOT (p_code_hash = ANY(current_codes)) THEN
    RETURN false;
  END IF;

  UPDATE public.admin_security
  SET recovery_code_hashes = array_remove(current_codes, p_code_hash),
      updated_at = now()
  WHERE id = 1;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_admin_recovery_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_admin_recovery_code(text) TO service_role;
