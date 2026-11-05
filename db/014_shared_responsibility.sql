-- =====================================================================
-- 014: Shared responsibility ("Hand over responsibility").
-- The family administrator can share the responsibility to report chosen
-- verified profiles with linked members (or someone new, through a QR code or
-- invitation). The administrator keeps ownership of the family.
--  * shared_responsibility: who (user) may report which profile (member).
--    They may report it, mark it found and change the number to call.
--    Rows go away when the profile or account is deleted, or the person
--    is no longer linked to the family (trigger below).
--  * family_invitations.with_responsibility + invitation_profiles: a request
--    to share responsibility for the chosen profiles; method 'member' asks
--    someone already linked (target_user_id). Requests expire after 24 hours.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE TABLE IF NOT EXISTS shared_responsibility (
    user_id    uuid NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    member_id  uuid NOT NULL REFERENCES family_members(member_id) ON DELETE CASCADE,
    granted_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_shared_member ON shared_responsibility (member_id);

ALTER TABLE family_invitations ADD COLUMN IF NOT EXISTS with_responsibility boolean NOT NULL DEFAULT false;
ALTER TABLE family_invitations ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES users(user_id) ON DELETE CASCADE;
ALTER TABLE family_invitations DROP CONSTRAINT IF EXISTS chk_invite_method;
ALTER TABLE family_invitations ADD CONSTRAINT chk_invite_method CHECK (method IN ('invite', 'qr', 'member'));
ALTER TABLE family_invitations DROP CONSTRAINT IF EXISTS chk_invite_status;
ALTER TABLE family_invitations ADD CONSTRAINT chk_invite_status
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked', 'declined', 'cancelled'));
CREATE INDEX IF NOT EXISTS idx_invite_target ON family_invitations (target_user_id, status);

CREATE TABLE IF NOT EXISTS invitation_profiles (
    invitation_id uuid NOT NULL REFERENCES family_invitations(invitation_id) ON DELETE CASCADE,
    member_id     uuid NOT NULL REFERENCES family_members(member_id) ON DELETE CASCADE,
    PRIMARY KEY (invitation_id, member_id)
);

-- Leaving the family (or being removed) ends the shared responsibility for its profiles.
CREATE OR REPLACE FUNCTION end_shared_responsibility() RETURNS trigger AS $$
BEGIN
    DELETE FROM shared_responsibility sr
    USING family_members fm
    WHERE sr.member_id = fm.member_id AND fm.group_id = OLD.group_id AND sr.user_id = OLD.user_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_end_shared_responsibility ON family_links;
CREATE TRIGGER trg_end_shared_responsibility
    AFTER DELETE ON family_links
    FOR EACH ROW EXECUTE FUNCTION end_shared_responsibility();

COMMIT;
