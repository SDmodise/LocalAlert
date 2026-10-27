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

module.exports = {
    findUserByEmail,
    findUserWithRoleByEmail,
    createUser,
    getRoleId,
    findProfileById,
    updateCurrentMunicipality
};
