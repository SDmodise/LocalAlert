-- =====================================================================
-- 013: Number to call. The family administrator can give a phone number
-- that people call when they see the missing person ("I have seen them").
-- Empty means SAPS (10111) is shown instead.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS contact_number varchar(10);
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS chk_alert_contact_number;
ALTER TABLE alerts ADD CONSTRAINT chk_alert_contact_number
    CHECK (contact_number IS NULL OR contact_number ~ '^0[1-8][0-9]{8}$');
COMMIT;
