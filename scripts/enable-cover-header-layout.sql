-- Enable Full screen (heroLayout: cover) for a stylist site.
-- Change USER_ID below if needed, then run in Supabase → SQL Editor.

DO $$
DECLARE
  v_user_id uuid := '592fb4b7-dff2-4fdc-bac0-c837c1228278';
BEGIN
  UPDATE public.styld_site_records
  SET
    data = jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{value,heroLayout}',
      '"cover"'::jsonb,
      true
    ),
    updated_at = now()
  WHERE user_id = v_user_id
    AND record_type = 'site_setting'
    AND record_key = 'site_theme';

  IF NOT FOUND THEN
    INSERT INTO public.styld_site_records (user_id, record_type, record_key, data)
    VALUES (
      v_user_id,
      'site_setting',
      'site_theme',
      jsonb_build_object('value', jsonb_build_object('heroLayout', 'cover'))
    );
  END IF;
END $$;

-- Verify
SELECT
  user_id,
  record_key,
  data -> 'value' ->> 'heroLayout' AS hero_layout
FROM public.styld_site_records
WHERE user_id = '592fb4b7-dff2-4fdc-bac0-c837c1228278'::uuid
  AND record_type = 'site_setting'
  AND record_key = 'site_theme';
