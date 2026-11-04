ALTER TABLE public.friend_passwords ADD COLUMN paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.friend_passwords ADD COLUMN expires_at timestamptz;
ALTER TABLE public.friend_passwords ADD COLUMN last_seen timestamptz;
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  detail text NOT NULL DEFAULT ''
);
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.site_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lockdown boolean NOT NULL DEFAULT false,
  hidden_games text[] NOT NULL DEFAULT '{}',
  kick_all_at timestamptz
);
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;