CREATE TABLE public.admin_security (
  id smallint PRIMARY KEY CHECK (id = 1),
  totp_secret_ciphertext text,
  totp_enabled boolean NOT NULL DEFAULT false,
  recovery_code_hashes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_security TO service_role;
ALTER TABLE public.admin_security ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token_hash text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'moderator', 'support')),
  device_id uuid,
  device text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX admin_sessions_active ON public.admin_sessions(expires_at) WHERE revoked_at IS NULL;
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_session_id uuid,
  actor_role text NOT NULL DEFAULT 'owner',
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  device text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);
GRANT ALL ON public.admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.prevent_admin_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Admin audit records are append-only';
END;
$$;
CREATE TRIGGER admin_audit_log_immutable
BEFORE UPDATE OR DELETE ON public.admin_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_audit_mutation();
REVOKE ALL ON FUNCTION public.prevent_admin_audit_mutation() FROM PUBLIC, anon, authenticated;
