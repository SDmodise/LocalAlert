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

module.exports = {
    findGroupByAdmin,
    createGroup,
    listProfiles,
    listLinkedMembers,
    createProfile,
    findProfileAccess,
};
