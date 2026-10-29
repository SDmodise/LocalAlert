/*
Database operations for family invitations (QR codes and in-app invitations).
Only a SHA-256 hash of each token is stored.
*/
const pool = require("../config/database");

const DETAILS = `
    fi.invitation_id, fi.group_id, fi.method, fi.status, fi.expires_at,
    fi.invite_email, fi.invite_phone, fi.created_at,
    fg.group_name, fg.admin_user_id,
    a.first_name AS admin_first_name, a.last_name AS admin_last_name
`;
const FROM = `
    FROM family_invitations fi
    JOIN family_groups fg ON fg.group_id = fi.group_id
    JOIN users a ON a.user_id = fg.admin_user_id
`;

async function create(inv) {
    const result = await pool.query(
        `INSERT INTO family_invitations
            (group_id, invited_by, token_hash, method, invite_email, invite_phone, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING invitation_id, method, status, expires_at;`,
        [inv.group_id, inv.invited_by, inv.token_hash, inv.method,
         inv.invite_email || null, inv.invite_phone || null, inv.expires_at]
    );
    return result.rows[0];
}

// A newer QR code replaces older unused ones for the same group.
async function revokePendingQr(groupId) {
    await pool.query(
        `UPDATE family_invitations SET status = 'revoked'
         WHERE group_id = $1 AND method = 'qr' AND status = 'pending';`,
        [groupId]
    );
}

async function findByTokenHash(tokenHash) {
    const result = await pool.query(`SELECT ${DETAILS} ${FROM} WHERE fi.token_hash = $1;`, [tokenHash]);
    return result.rows[0];
}

async function findById(invitationId) {
    const result = await pool.query(`SELECT ${DETAILS} ${FROM} WHERE fi.invitation_id = $1;`, [invitationId]);
    return result.rows[0];
}

// Pending, unexpired invitations addressed to this user's email or phone,
// for groups they are not already linked to.
async function listForUser(email, phone, userId) {
    const result = await pool.query(
        `SELECT ${DETAILS} ${FROM}
         WHERE fi.method = 'invite' AND fi.status = 'pending' AND fi.expires_at > CURRENT_TIMESTAMP
           AND (lower(fi.invite_email) = $1 OR fi.invite_phone = $2)
           AND fg.admin_user_id <> $3
           AND NOT EXISTS (SELECT 1 FROM family_links fl WHERE fl.group_id = fi.group_id AND fl.user_id = $3)
         ORDER BY fi.created_at DESC;`,
        [email, phone, userId]
    );
    return result.rows;
}

async function markExpired(invitationId) {
    await pool.query(
        `UPDATE family_invitations SET status = 'expired' WHERE invitation_id = $1 AND status = 'pending';`,
        [invitationId]
    );
}

async function decline(invitationId) {
    await pool.query(
        `UPDATE family_invitations SET status = 'revoked' WHERE invitation_id = $1 AND status = 'pending';`,
        [invitationId]
    );
}

async function isLinked(groupId, userId) {
    const result = await pool.query(
        `SELECT 1 FROM family_links WHERE group_id = $1 AND user_id = $2;`,
        [groupId, userId]
    );
    return result.rowCount > 0;
}

// Links the user and marks the invitation accepted in one transaction.
// Returns false if the invitation was used by someone else in the meantime.
async function accept(invitationId, groupId, userId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const updated = await client.query(
            `UPDATE family_invitations
             SET status = 'accepted', accepted_by = $2, accepted_at = CURRENT_TIMESTAMP
             WHERE invitation_id = $1 AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP;`,
            [invitationId, userId]
        );
        if (updated.rowCount === 0) {
            await client.query("ROLLBACK");
            return false;
        }
        await client.query(
            `INSERT INTO family_links (group_id, user_id) VALUES ($1, $2)
             ON CONFLICT (group_id, user_id) DO NOTHING;`,
            [groupId, userId]
        );
        await client.query("COMMIT");
        return true;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    create, revokePendingQr, findByTokenHash, findById, listForUser,
    markExpired, decline, isLinked, accept,
};
