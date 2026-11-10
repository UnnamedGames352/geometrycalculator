ALTER TABLE public.friend_passwords
  ADD COLUMN IF NOT EXISTS browser_version text,
  ADD COLUMN IF NOT EXISTS screen text,
  ADD COLUMN IF NOT EXISTS cpu_cores integer,
  ADD COLUMN IF NOT EXISTS memory_gb real,
  ADD COLUMN IF NOT EXISTS total_play_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS play_seconds jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_note text NOT NULL DEFAULT '';