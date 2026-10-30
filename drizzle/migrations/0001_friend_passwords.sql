CREATE TABLE public.friend_passwords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  password text NOT NULL UNIQUE,
  active_session text,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.friend_passwords TO service_role;
ALTER TABLE public.friend_passwords ENABLE ROW LEVEL SECURITY;