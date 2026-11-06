ALTER TABLE public.friend_passwords ADD COLUMN current_game text, ADD COLUMN game_started_at timestamptz, ADD COLUMN message text;
CREATE TABLE public.banned_ips (ip text PRIMARY KEY, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.banned_ips TO service_role;
ALTER TABLE public.banned_ips ENABLE ROW LEVEL SECURITY;