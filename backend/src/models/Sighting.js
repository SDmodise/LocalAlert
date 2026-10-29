/*
Spotted reports (sighting_reports): sent by anyone who received an alert,
seen only by the family (FR: Spotted report goes straight to the family).
*/
const pool = require("../config/database");

const tz = (column) => `(${column} AT TIME ZONE current_setting('TimeZone'))`;

async function create({ alert_id, user_id, description, photo_url, latitude, longitude, reporter_name, child_name }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const inserted = await client.query(
            `INSERT INTO sighting_reports (alert_id, user_id, description, photo_url, latitude, longitude, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
             RETURNING report_id, ${tz("reported_at")} AS reported_at;`,
            [alert_id, user_id, description, photo_url, latitude, longitude]
        );
        // Tell the family administrator and linked members (not the reporter).
        const what = description ? `"${description.slice(0, 80)}${description.length > 80 ? "…" : ""}"` :
            latitude != null ? "Location shared. Tap to view." : "A photo was added. Tap to view.";
        await client.query(
            `INSERT INTO notifications
                (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level, municipality_id)
             SELECT DISTINCT u.user_id, a.alert_id, $3, $4, 'spotted_report', 'family', a.escalation_level, a.municipality_id
             FROM alerts a
             JOIN family_members fm ON fm.member_id = a.member_id
             JOIN family_groups fg ON fg.group_id = fm.group_id
             JOIN LATERAL (
                SELECT fg.admin_user_id AS user_id
                UNION SELECT fl.user_id FROM family_links fl WHERE fl.group_id = fg.group_id
             ) u ON TRUE
             WHERE a.alert_id = $1 AND u.user_id <> $2;`,
            [alert_id, user_id, `New sighting of ${child_name}`.slice(0, 100), `${reporter_name} reported: ${what}`]
        );
        await client.query("COMMIT");
        return inserted.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function countByUser(alertId, userId) {
    const result = await pool.query(
        `SELECT count(*)::int AS n FROM sighting_reports WHERE alert_id = $1 AND user_id = $2;`,
        [alertId, userId]
    );
    return result.rows[0].n;
}

async function listForAlert(alertId) {
    const result = await pool.query(
        `SELECT s.report_id, s.description, s.latitude, s.longitude, (s.photo_url IS NOT NULL) AS has_photo,
                ${tz("s.reported_at")} AS reported_at, u.first_name AS reporter_first_name
         FROM sighting_reports s LEFT JOIN users u ON u.user_id = s.user_id
         WHERE s.alert_id = $1
         ORDER BY s.reported_at DESC;`,
        [alertId]
    );
    return result.rows;
}

async function findPhoto(alertId, reportId) {
    const result = await pool.query(
        `SELECT photo_url FROM sighting_reports WHERE alert_id = $1 AND report_id = $2;`,
        [alertId, reportId]
    );
    return result.rows[0]?.photo_url || null;
}

module.exports = { create, countByUser, listForAlert, findPhoto };
