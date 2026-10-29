/*
One-time password reset codes (table password_reset_codes, migration 011).
Times are compared inside PostgreSQL so the server's time zone does not matter.
*/
const pool = require("../config/database");

// How many codes were sent in the last hour, and seconds since the newest one.
async function recentActivity(userId) {
    const result = await pool.query(
        `SELECT count(*)::int AS sent_last_hour,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - max(created_at)))::int AS seconds_since_last
         FROM password_reset_codes
         WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - interval '1 hour';`,
        [userId]
    );
    return result.rows[0];
}

// Saves a new code and cancels any older unused ones, so only the newest code works.
async function create(userId, codeHash, minutesValid) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND used_at IS NULL;`,
            [userId]
        );
        await client.query(
            `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(mins => $3));`,
            [userId, codeHash, minutesValid]
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// The newest code that is unused and not expired, or undefined.
async function findActive(userId) {
    const result = await pool.query(
        `SELECT reset_id, code_hash, attempts
         FROM password_reset_codes
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         ORDER BY created_at DESC
         LIMIT 1;`,
        [userId]
    );
    return result.rows[0];
}

async function addFailedAttempt(resetId) {
    const result = await pool.query(
        `UPDATE password_reset_codes SET attempts = attempts + 1
         WHERE reset_id = $1 RETURNING attempts;`,
        [resetId]
    );
    return result.rows[0].attempts;
}

// Sets the new password, signs out all existing logins and uses up every open code.
// Returns false if the code was used by another request in the meantime.
async function completeReset(userId, resetId, passwordHash) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const claimed = await client.query(
            `UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP
             WHERE reset_id = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
             RETURNING reset_id;`,
            [resetId]
        );
        if (!claimed.rowCount) {
            await client.query("ROLLBACK");
            return false;
        }
        await client.query(
            `UPDATE password_reset_codes SET used_at = CURRENT_TIMESTAMP
             WHERE user_id = $1 AND used_at IS NULL;`,
            [userId]
        );
        await client.query(
            `UPDATE users
             SET password_hash = $2, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = $1;`,
            [userId, passwordHash]
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

module.exports = { recentActivity, create, findActive, addFailedAttempt, completeReset };
