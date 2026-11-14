-- Activity records should never retain submitted passwords, access codes, or other secret inputs.
UPDATE public.activity_log
SET attempted_input = NULL
WHERE attempted_input IS NOT NULL;
