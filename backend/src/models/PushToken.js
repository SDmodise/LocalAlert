/*
Expo push tokens: one per phone the user is logged in on (table push_tokens, migration 012).
*/
const pool = require("../config/database");

// Saves the phone's token for this user. A phone that logs in with another account moves to it.
async function save(userId, token, platform) {
    await pool.query(
        `INSERT INTO push_tokens (token, user_id, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE
            SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = CURRENT_TIMESTAMP;`,
        [token, userId, platform]
    );
}

async function remove(token) {
    await pool.query(`DELETE FROM push_tokens WHERE token = $1;`, [token]);
}

async function removeMany(tokens) {
    if (tokens.length) await pool.query(`DELETE FROM push_tokens WHERE token = ANY($1::text[]);`, [tokens]);
}

// Every phone of these users: [{ token, user_id }].
async function forUsers(userIds) {
    if (!userIds.length) return [];
    const result = await pool.query(
        `SELECT token, user_id FROM push_tokens WHERE user_id = ANY($1::uuid[]);`,
        [userIds]
    );
    return result.rows;
}

module.exports = { save, remove, removeMany, forUsers };
