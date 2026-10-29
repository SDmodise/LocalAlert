-- 006: place name for an alert's last known location (e.g. "Soshanguve Crossing Mall"),
-- shown to everyone who receives the alert. The coordinates stay in latitude/longitude.
BEGIN;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_seen_place VARCHAR(150);
COMMIT;
