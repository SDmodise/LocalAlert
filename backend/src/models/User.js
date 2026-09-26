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

async function createUser(userData) {
    const query = `
        INSERT INTO users (
            role_id,
            first_name,
            last_name,
            email,
            password_hash,
            phone_number
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING user_id, first_name, last_name, email;
    `;

    const values = [
        userData.role_id,
        userData.first_name,
        userData.last_name,
        userData.email,
        userData.password_hash,
        userData.phone_number
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

module.exports = {
    findUserByEmail,
    createUser,
    getRoleId
};
