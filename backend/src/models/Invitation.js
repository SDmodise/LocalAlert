/*
Database operations for family invitations (QR codes and in-app invitations).
Only a SHA-256 hash of each token is stored.
*/
const pool = require("../config/database");

const DETAILS = `
    fi.invitation_id, fi.group_id, fi.method, fi.status, fi.expires_at,
    fi.invite_email, fi.invite_phone, fi.created_at, fi.with_responsibility, fi.target_user_id,
    fg.group_name, fg.admin_user_id,
    a.first_name AS admin_first_name, a.last_name AS admin_last_name
`;
const FROM = `
    FROM family_invitations fi
    JOIN family_groups fg ON fg.group_id = fi.group_id
    JOIN users a ON a.user_id = fg.admin_user_id
`;

async function create(inv) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const created = await createWith(client, inv);
        if (inv.with_responsibility && inv.member_ids?.length) {
            await client.query(
                `INSERT INTO invitation_profiles (invitation_id, member_id)
                 SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING;`,
                [created.invitation_id, inv.member_ids]
            );
        }
        await client.query("COMMIT");
        return created;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function createWith(client, inv) {
    const result = await client.query(
        `INSERT INTO family_invitations
            (group_id, invited_by, token_hash, method, invite_email, invite_phone, expires_at,
             with_responsibility, target_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING invitation_id, method, status, expires_at, with_responsibility;`,
        [inv.group_id, inv.invited_by, inv.token_hash, inv.method,
         inv.invite_email || null, inv.invite_phone || null, inv.expires_at,
         Boolean(inv.with_responsibility), inv.target_user_id || null]
    );
    return result.rows[0];
}

// A newer QR code replaces older unused ones of the same kind for the same group.
async function revokePendingQr(groupId, withResponsibility = false) {
    await pool.query(
        `UPDATE family_invitations SET status = 'revoked'
         WHERE group_id = $1 AND method = 'qr' AND status = 'pending' AND with_responsibility = $2;`,
        [groupId, Boolean(withResponsibility)]
    );
}

// A new request to a linked member replaces an older pending one to the same person.
async function revokePendingForMember(groupId, userId) {
    await pool.query(
        `UPDATE family_invitations SET status = 'revoked'
         WHERE group_id = $1 AND method = 'member' AND target_user_id = $2 AND status = 'pending';`,
        [groupId, userId]
    );
}

// Names of the profiles a responsibility request is for.
async function profilesFor(invitationId) {
    const result = await pool.query(
        `SELECT fm.member_id, fm.full_name FROM invitation_profiles ip
         JOIN family_members fm ON fm.member_id = ip.member_id
         WHERE ip.invitation_id = $1 ORDER BY fm.created_at;`,
        [invitationId]
    );
    return result.rows;
}

// Pending responsibility requests of a group (for the administrator), with who they are for.
async function pendingResponsibility(groupId) {
    const result = await pool.query(
        `SELECT fi.invitation_id, fi.method, fi.invite_email, fi.invite_phone, fi.expires_at, fi.created_at,
                t.first_name AS target_first_name, t.last_name AS target_last_name,
                COALESCE((SELECT array_agg(fm.full_name ORDER BY fm.created_at) FROM invitation_profiles ip
                          JOIN family_members fm ON fm.member_id = ip.member_id
                          WHERE ip.invitation_id = fi.invitation_id), '{}') AS profile_names
         FROM family_invitations fi
         LEFT JOIN users t ON t.user_id = fi.target_user_id
         WHERE fi.group_id = $1 AND fi.with_responsibility AND fi.status = 'pending'
           AND fi.expires_at > CURRENT_TIMESTAMP
         ORDER BY fi.created_at DESC;`,
        [groupId]
    );
    return result.rows;
}

// The administrator cancels a pending responsibility request.
async function cancel(invitationId, groupId) {
    const result = await pool.query(
        `UPDATE family_invitations SET status = 'cancelled'
         WHERE invitation_id = $1 AND group_id = $2 AND status = 'pending' AND with_responsibility;`,
        [invitationId, groupId]
    );
    return result.rowCount > 0;
}

async function findByTokenHash(tokenHash) {
    const result = await pool.query(`SELECT ${DETAILS} ${FROM} WHERE fi.token_hash = $1;`, [tokenHash]);
    return result.rows[0];
}

async function findById(invitationId) {
    const result = await pool.query(`SELECT ${DETAILS} ${FROM} WHERE fi.invitation_id = $1;`, [invitationId]);
    return result.rows[0];
}

// Pending, unexpired invitations for this user: sent to their email or phone, or a
// responsibility request to them as a linked member. Joining invitations are left out
// for groups they are already linked to; responsibility requests are left out once
// they already share the responsibility.
async function listForUser(email, phone, userId) {
    const result = await pool.query(
        `SELECT ${DETAILS} ${FROM}
         WHERE fi.status = 'pending' AND fi.expires_at > CURRENT_TIMESTAMP
           AND ((fi.method = 'invite' AND (lower(fi.invite_email) = $1 OR fi.invite_phone = $2))
                OR (fi.method = 'member' AND fi.target_user_id = $3))
           AND fg.admin_user_id <> $3
           AND (fi.with_responsibility
                OR NOT EXISTS (SELECT 1 FROM family_links fl WHERE fl.group_id = fi.group_id AND fl.user_id = $3))
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
        `UPDATE family_invitations SET status = 'declined' WHERE invitation_id = $1 AND status = 'pending';`,
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


// Links the user (and, for a responsibility request, shares the responsibility)
// and marks the invitation accepted in one transaction.
// Returns false if the invitation was used by someone else in the meantime.
async function accept(invitationId, groupId, userId, withResponsibility = false) {
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
        if (withResponsibility) {
            // The chosen profiles that still exist and are verified are shared with the user.
            await client.query(
                `INSERT INTO shared_responsibility (user_id, member_id)
                 SELECT $2, ip.member_id FROM invitation_profiles ip
                 JOIN family_members fm ON fm.member_id = ip.member_id
                 WHERE ip.invitation_id = $1 AND fm.group_id = $3 AND fm.verification_status = 'verified'
                 ON CONFLICT DO NOTHING;`,
                [invitationId, userId, groupId]
            );
        }
        await client.query("COMMIT");
        return true;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Accounts that use this email or phone number (who gets a push for a new invitation).
async function findInvitedUserIds(email, phone, excludeUserId) {
    const result = await pool.query(
        `SELECT user_id FROM users
         WHERE ((lower(email) = $1) OR ($2::text IS NOT NULL AND phone_number = $2))
           AND user_id <> $3;`,
        [email, phone, excludeUserId]
    );
    return result.rows.map((r) => r.user_id);
}

module.exports = {
    findInvitedUserIds,
    create, revokePendingQr, revokePendingForMember, pendingResponsibility, cancel,
    findByTokenHash, findById, listForUser,
    markExpired, decline, isLinked, accept, profilesFor,
};
