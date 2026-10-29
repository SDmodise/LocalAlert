/*
This contains all database operations related to users
*/

const pool = require("../config/database");

async function findUserByEmail(email) {
    const query = `
        SELECT *
        FROM users
        WHERE email = $1;
    `;

    const result = await pool.query(query, [email]);
    return result.rows[0];
}

async function findUserWithRoleByEmail(email) {
    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email,
               u.password_hash, r.role_name
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        WHERE lower(u.email) = $1;
    `;

    const result = await pool.query(query, [email]);
    return result.rows[0];
}

async function createUser(userData) {
    const query = `
        INSERT INTO users (
            role_id,
            first_name,
            last_name,
            email,
            password_hash,
            phone_number,
            pin_hash,
            municipality_id,
            current_municipality_id,
            last_location_at,
            privacy_consent_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8,
                CASE WHEN $8::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
                CURRENT_TIMESTAMP)
        RETURNING user_id, first_name, last_name, email, municipality_id;
    `;

    const values = [
        userData.role_id,
        userData.first_name,
        userData.last_name,
        userData.email,
        userData.password_hash,
        userData.phone_number,
        userData.pin_hash || null,
        userData.municipality_id || null
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
}

async function getRoleId(roleName) {
    const query = `
        SELECT role_id
        FROM roles
        WHERE role_name = $1;
    `;

    const result = await pool.query(query, [roleName]);
    return result.rows[0];
}

async function findProfileById(userId) {
    const query = `
        SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone_number,
               r.role_name AS role,
               hm.municipality_name AS home_municipality,
               hm.province AS home_province,
               cm.municipality_name AS current_municipality,
               u.last_location_at, u.created_at
        FROM users u
        JOIN roles r ON r.role_id = u.role_id
        LEFT JOIN municipalities hm ON hm.municipality_id = u.municipality_id
        LEFT JOIN municipalities cm ON cm.municipality_id = u.current_municipality_id
        WHERE u.user_id = $1;
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0];
}

// Sets the current municipality (NULL when outside the covered area).
// A user who skipped location at sign-up also gets their home municipality here.
async function updateCurrentMunicipality(userId, municipalityId) {
    const query = `
        UPDATE users
        SET current_municipality_id = $2,
            municipality_id = COALESCE(municipality_id, $2),
            last_location_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1;
    `;

    await pool.query(query, [userId, municipalityId]);
}

async function findPasswordHash(userId) {
    const result = await pool.query(`SELECT password_hash FROM users WHERE user_id = $1;`, [userId]);
    return result.rows[0]?.password_hash || null;
}

async function countOpenAlertsCreatedBy(userId) {
    const result = await pool.query(
        `SELECT count(*)::int AS n FROM alerts
         WHERE created_by = $1 AND lower(status) IN ('active', 'still_missing');`,
        [userId]
    );
    return result.rows[0].n;
}

// Deletes the account and everything that belongs only to it:
//  - the family group the user administers, with its profiles, links and invitations
//  - the (closed) alerts the user created, with their notifications, sightings and history
//  - the user's notifications, family links and sent invitations
// Sighting reports the user sent on other families' alerts are kept for those families,
// without the user's name. Returns the stored file paths that should now be deleted.
async function deleteAccount(userId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const files = await client.query(
            `SELECT fm.photo_url AS path FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id WHERE fg.admin_user_id = $1
             UNION SELECT fm.id_document_url FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id WHERE fg.admin_user_id = $1
             UNION SELECT a.photo_url FROM alerts a WHERE a.created_by = $1
             UNION SELECT s.photo_url FROM sighting_reports s JOIN alerts a ON a.alert_id = s.alert_id WHERE a.created_by = $1;`,
            [userId]
        );
        await client.query(`DELETE FROM alerts WHERE created_by = $1;`, [userId]);
        await client.query(`DELETE FROM family_groups WHERE admin_user_id = $1;`, [userId]);
        const deleted = await client.query(`DELETE FROM users WHERE user_id = $1;`, [userId]);
        await client.query("COMMIT");
        return { deleted: deleted.rowCount > 0, files: files.rows.map((r) => r.path).filter(Boolean) };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    findPasswordHash,
    countOpenAlertsCreatedBy,
    deleteAccount,
    findUserByEmail,
    findUserWithRoleByEmail,
    createUser,
    getRoleId,
    findProfileById,
    updateCurrentMunicipality
};
