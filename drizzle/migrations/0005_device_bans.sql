CREATE TABLE public.banned_devices (
  device_id text PRIMARY KEY,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.banned_devices TO service_role;
ALTER TABLE public.banned_devices ENABLE ROW LEVEL SECURITY;
