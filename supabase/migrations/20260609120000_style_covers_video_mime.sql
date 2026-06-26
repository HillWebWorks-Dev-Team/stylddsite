-- Allow portfolio video uploads in the style-covers bucket.
UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT array_agg(DISTINCT mime)
  FROM unnest(
    COALESCE(allowed_mime_types, ARRAY[]::text[]) ||
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']::text[]
  ) AS mime
)
WHERE id = 'style-covers';
