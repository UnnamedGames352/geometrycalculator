ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS emergency_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emergency_notice text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_emergency_level_check CHECK (emergency_level BETWEEN 0 AND 4);
