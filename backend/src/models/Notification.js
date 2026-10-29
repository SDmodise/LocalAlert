/*
Database operations for a user's notifications (screen 17).
*/
const pool = require("../config/database");

const tz = (column) => `(${column} AT TIME ZONE current_setting('TimeZone'))`;

async function listForUser(userId, limit) {
    const result = await pool.query(
        `SELECT n.notification_id, n.alert_id, n.notification_type, n.recipient_type, n.escalation_level,
                n.title, n.message, n.is_read, ${tz("n.created_at")} AS created_at,
                a.child_name, lower(a.status) AS alert_status, (a.photo_url IS NOT NULL) AS has_photo
         FROM notifications n
         JOIN alerts a ON a.alert_id = n.alert_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC, n.notification_id
         LIMIT $2;`,
        [userId, limit]
    );
    return result.rows;
}

async function unreadCount(userId) {
    const result = await pool.query(
        `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = false;`,
        [userId]
    );
    return result.rows[0].n;
}

// Marks the given notifications (or all of them when ids is null) as read.
async function markRead(userId, ids) {
    const result = await pool.query(
        `UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND is_read = false
           AND ($2::uuid[] IS NULL OR notification_id = ANY($2::uuid[]));`,
        [userId, ids]
    );
    return result.rowCount;
}

// All unread notifications about one alert (used when the user opens that alert).
async function markAlertRead(userId, alertId) {
    const result = await pool.query(
        `UPDATE notifications SET is_read = true, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND alert_id = $2 AND is_read = false;`,
        [userId, alertId]
    );
    return result.rowCount;
}

module.exports = { listForUser, unreadCount, markRead, markAlertRead };
