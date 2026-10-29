-- 010: the ID document photo is optional. A profile is verified by a valid ID number
-- that matches its date of birth and gender (checked by the server, then discarded).
-- Removes the rule that a verified profile must have an ID document on file.
BEGIN;
ALTER TABLE family_members DROP CONSTRAINT IF EXISTS chk_verified_needs_id;
COMMIT;
