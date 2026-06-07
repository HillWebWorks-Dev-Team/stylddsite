-- Fake client reviews for bizmous* user (preview the website carousel).
-- Run in Supabase SQL Editor after 20260607120000_reviews_system.sql.

DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email ILIKE 'bizmous%' LIMIT 1;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'bizmous user not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM styld_site_records
    WHERE user_id = v_uid AND record_type = 'site_setting' AND record_key = 'reviews_settings'
  ) THEN
    INSERT INTO styld_site_records (user_id, record_type, record_key, data)
    VALUES (v_uid, 'site_setting', 'reviews_settings', '{"value":{"enabled":true}}'::jsonb);
  ELSE
    UPDATE styld_site_records SET data = '{"value":{"enabled":true}}'::jsonb, updated_at = now()
    WHERE user_id = v_uid AND record_type = 'site_setting' AND record_key = 'reviews_settings';
  END IF;

  DELETE FROM styld_site_records
  WHERE user_id = v_uid AND record_type = 'review' AND coalesce(data->>'source','') = 'seed';

  INSERT INTO styld_site_records (user_id, record_type, data) VALUES
  (v_uid,'review','{"client_name":"Amara Johnson","rating":5,"message":"Best knotless braids I have ever had. Super neat parts, no tension, and she finished right on time.","published":true,"source":"seed"}'::jsonb),
  (v_uid,'review','{"client_name":"Destiny Williams","rating":5,"message":"The boho braids were everything! Full, flowy, and they lasted weeks.","published":true,"source":"seed"}'::jsonb),
  (v_uid,'review','{"client_name":"Kezia Thompson","rating":4,"message":"Really loved my passion twists. Style came out beautiful.","published":true,"source":"seed"}'::jsonb),
  (v_uid,'review','{"client_name":"Naomi Clarke","rating":5,"message":"Professional from start to finish. My hair looks incredible.","published":true,"source":"seed"}'::jsonb),
  (v_uid,'review','{"client_name":"Jasmine Reed","rating":5,"message":"My feed-ins are crisp and I got so many compliments.","published":true,"source":"seed"}'::jsonb),
  (v_uid,'review','{"client_name":"Priya Washington","rating":5,"message":"Wig install was seamless — looked like it grew from my scalp.","published":true,"source":"seed"}'::jsonb),
  (v_uid,'review','{"client_name":"Rochelle King","rating":4,"message":"Great experience. Booking online was simple and results matched my inspo pics.","published":true,"source":"seed"}'::jsonb);
END;
$$;
