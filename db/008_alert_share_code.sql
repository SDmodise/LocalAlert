-- 008: public share links for alerts (e.g. https://<server>/a/Xy7kP2qLm9A).
-- The share code is random and unguessable, and separate from the alert's internal id.
-- The public page always reads the alert live from the database, so a shared link
-- never shows outdated details; once the person is found, the page says so and hides the photo.
BEGIN;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS share_code VARCHAR(16);
CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_share_code ON alerts (share_code) WHERE share_code IS NOT NULL;
COMMIT;
