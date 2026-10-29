/*
Database operations for Family Link: groups, profiles and linked members.
*/
const pool = require("../config/database");

const PROFILE_COLUMNS = `
    fm.member_id, fm.group_id, fm.user_id, fm.full_name,
    to_char(fm.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
    fm.gender, fm.physical_description,
    (fm.photo_url IS NOT NULL) AS has_photo,
    (fm.id_document_url IS NOT NULL) AS has_id_document,
    fm.verification_status, fm.created_at
`;

async function findGroupByAdmin(adminUserId) {
    const result = await pool.query(
        `SELECT group_id, admin_user_id, group_name, created_at
         FROM family_groups WHERE admin_user_id = $1
         ORDER BY created_at LIMIT 1;`,
        [adminUserId]
    );
    return result.rows[0];
}

async function createGroup(adminUserId, groupName) {
    const result = await pool.query(
        `INSERT INTO family_groups (admin_user_id, group_name)
         VALUES ($1, $2)
         RETURNING group_id, admin_user_id, group_name, created_at;`,
        [adminUserId, groupName]
    );
    return result.rows[0];
}

async function listProfiles(groupId) {
    const result = await pool.query(
        `SELECT ${PROFILE_COLUMNS} FROM family_members fm
         WHERE fm.group_id = $1 ORDER BY fm.created_at;`,
        [groupId]
    );
    return result.rows;
}

async function listLinkedMembers(groupId) {
    const result = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, fl.linked_at
         FROM family_links fl JOIN users u ON u.user_id = fl.user_id
         WHERE fl.group_id = $1 ORDER BY fl.linked_at;`,
        [groupId]
    );
    return result.rows;
}

async function createProfile(p) {
    const result = await pool.query(
        `INSERT INTO family_members
            (group_id, full_name, date_of_birth, gender, physical_description,
             photo_url, id_document_url, verification_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING member_id;`,
        [p.group_id, p.full_name, p.date_of_birth, p.gender, p.physical_description,
         p.photo_url, p.id_document_url, p.verification_status]
    );
    const rows = await pool.query(
        `SELECT ${PROFILE_COLUMNS} FROM family_members fm WHERE fm.member_id = $1;`,
        [result.rows[0].member_id]
    );
    return rows.rows[0];
}

// Profile plus who may see it: the group's administrator and linked members.
async function findProfileAccess(memberId, userId) {
    const result = await pool.query(
        `SELECT fm.member_id, fm.photo_url, fm.id_document_url,
                (fg.admin_user_id = $2) AS is_admin,
                EXISTS (SELECT 1 FROM family_links fl
                        WHERE fl.group_id = fm.group_id AND fl.user_id = $2) AS is_linked
         FROM family_members fm
         JOIN family_groups fg ON fg.group_id = fm.group_id
         WHERE fm.member_id = $1;`,
        [memberId, userId]
    );
    return result.rows[0];
}

// Family groups the user is linked to (as a linked family member), with the administrator's name.
async function listLinkedGroups(userId) {
    const result = await pool.query(
        `SELECT fg.group_id, fg.group_name, u.first_name AS admin_first_name, u.last_name AS admin_last_name,
                fl.linked_at
         FROM family_links fl
         JOIN family_groups fg ON fg.group_id = fl.group_id
         JOIN users u ON u.user_id = fg.admin_user_id
         WHERE fl.user_id = $1
         ORDER BY fl.linked_at;`,
        [userId]
    );
    return result.rows;
}

// Removes a profile. Returns the deleted row's file paths (to delete the files),
// or null if it does not exist. Past alerts keep their own copy of the details.
async function deleteProfile(memberId) {
    const result = await pool.query(
        `DELETE FROM family_members WHERE member_id = $1 RETURNING photo_url, id_document_url;`,
        [memberId]
    );
    return result.rows[0] || null;
}

// Open alerts for a profile (a profile can't be removed while someone is searching for them).
async function hasOpenAlert(memberId) {
    const result = await pool.query(
        `SELECT 1 FROM alerts WHERE member_id = $1 AND lower(status) IN ('active', 'still_missing') LIMIT 1;`,
        [memberId]
    );
    return result.rowCount > 0;
}

// Is this photo still used by an alert (alerts may point to the profile photo)?
async function photoUsedByAlert(photoUrl) {
    if (!photoUrl) return false;
    const result = await pool.query(`SELECT 1 FROM alerts WHERE photo_url = $1 LIMIT 1;`, [photoUrl]);
    return result.rowCount > 0;
}

async function findProfileGroup(memberId) {
    const result = await pool.query(
        `SELECT fm.member_id, fm.full_name, fm.group_id, fg.admin_user_id
         FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
         WHERE fm.member_id = $1;`,
        [memberId]
    );
    return result.rows[0];
}

async function findGroup(groupId) {
    const result = await pool.query(
        `SELECT group_id, group_name, admin_user_id FROM family_groups WHERE group_id = $1;`,
        [groupId]
    );
    return result.rows[0];
}

// Unlinks a user from a family group. Returns true if they were linked.
async function removeLink(groupId, userId) {
    const result = await pool.query(
        `DELETE FROM family_links WHERE group_id = $1 AND user_id = $2;`,
        [groupId, userId]
    );
    return result.rowCount > 0;
}

// Profile with its group's administrator and whether it is in an open alert.
async function findProfileForRemoval(memberId) {
    const result = await pool.query(
        `SELECT fm.member_id, fm.group_id, fm.full_name, fm.photo_url, fm.id_document_url, fg.admin_user_id,
                EXISTS (SELECT 1 FROM alerts a WHERE a.member_id = fm.member_id
                        AND lower(a.status) IN ('active', 'still_missing')) AS in_open_alert
         FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
         WHERE fm.member_id = $1;`,
        [memberId]
    );
    return result.rows[0];
}

// Removes a profile. Closed alerts about this person stay (the family keeps its history)
// but no longer point to the deleted photo.
async function deleteProfile(profile) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `UPDATE alerts SET photo_url = NULL WHERE member_id = $1 AND photo_url = $2;`,
            [profile.member_id, profile.photo_url]
        );
        await client.query(`DELETE FROM family_members WHERE member_id = $1;`, [profile.member_id]);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Unlinks a user from a family group. Returns true if they were linked.
async function removeLink(groupId, userId) {
    const result = await pool.query(
        `DELETE FROM family_links WHERE group_id = $1 AND user_id = $2;`,
        [groupId, userId]
    );
    return result.rowCount > 0;
}

// Profile with everything needed to edit it.
async function findProfileForEdit(memberId) {
    const result = await pool.query(
        `SELECT fm.member_id, fm.group_id, fm.full_name, to_char(fm.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                fm.gender, fm.photo_url, fm.id_document_url, fm.verification_status, fg.admin_user_id
         FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
         WHERE fm.member_id = $1;`,
        [memberId]
    );
    return result.rows[0];
}

// Is this stored photo still used by any alert (alerts can share the profile photo)?
async function photoUsedByAlert(photoPath) {
    if (!photoPath) return false;
    const result = await pool.query(`SELECT 1 FROM alerts WHERE photo_url = $1 LIMIT 1;`, [photoPath]);
    return result.rowCount > 0;
}

// Updates the given profile fields and returns the profile as the app sees it.
async function updateProfile(memberId, changes) {
    const allowed = ["full_name", "physical_description", "photo_url", "id_document_url", "verification_status"];
    const keys = Object.keys(changes).filter((k) => allowed.includes(k));
    if (keys.length) {
        const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
        await pool.query(
            `UPDATE family_members SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE member_id = $1;`,
            [memberId, ...keys.map((k) => changes[k])]
        );
    }
    const rows = await pool.query(`SELECT ${PROFILE_COLUMNS} FROM family_members fm WHERE fm.member_id = $1;`, [memberId]);
    return rows.rows[0];
}

module.exports = {
    findProfileForEdit,
    photoUsedByAlert,
    updateProfile,
    findProfileForRemoval,
    deleteProfile,
    removeLink,
    deleteProfile,
    hasOpenAlert,
    photoUsedByAlert,
    findProfileGroup,
    findGroup,
    removeLink,
    listLinkedGroups,
    findGroupByAdmin,
    createGroup,
    listProfiles,
    listLinkedMembers,
    createProfile,
    findProfileAccess,
};
