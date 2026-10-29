-- =====================================================================
-- 011: Forgot password.
--  * password_reset_codes: one-time 6-digit codes emailed to the user
--    (only a bcrypt hash of the code is stored; 15-minute expiry; 5 tries).
--  * users.token_version: goes up by one when the password is reset, so
--    every login made with the old password is signed out.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_reset_codes (
    reset_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    attempts   integer NOT NULL DEFAULT 0,
    expires_at timestamp NOT NULL,
    used_at    timestamp,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user
    ON password_reset_codes (user_id, created_at DESC);

COMMIT;
