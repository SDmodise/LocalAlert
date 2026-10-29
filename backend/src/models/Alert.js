/*
Database operations for alerts: creating an alert, sending it to the right
people, escalating it, and reading it back.

Who receives an alert (Phase 4, section 4.1.2):
  Family   - the group's linked members, immediately (recipient_type 'family')
  Level 1  - users whose home or current municipality is the origin municipality
  Level 2  - plus users in municipalities bordering the origin
  Level 3  - plus users in municipalities bordering those
  Level 4  - all users
Each user gets one 'alert' notification per alert (unique index uq_notif_alert_user).
Linked family members also get an 'escalation' notification at each new level.
*/
const pool = require("../config/database");

// Municipalities covered at a level: the origin, then one ring of neighbours per level.
// Level 4 returns null, meaning everyone.
async function municipalitiesForLevel(client, originId, level) {
    if (level >= 4) return null;
    let ids = [originId];
    for (let ring = 1; ring < level; ring++) {
        const result = await client.query(
            `SELECT DISTINCT neighbour_municipality_id AS id
             FROM municipality_neighbours WHERE municipality_id = ANY($1::int[]);`,
            [ids]
        );
        ids = [...new Set([...ids, ...result.rows.map((r) => r.id)])];
    }
    return ids;
}

// The family group behind an alert: its administrator and linked members.
async function familyOf(client, alertId) {
    const result = await client.query(
        `SELECT fg.group_id, fg.admin_user_id,
                COALESCE(array_agg(fl.user_id) FILTER (WHERE fl.user_id IS NOT NULL), '{}') AS linked
         FROM alerts a
         JOIN family_members fm ON fm.member_id = a.member_id
         JOIN family_groups fg ON fg.group_id = fm.group_id
         LEFT JOIN family_links fl ON fl.group_id = fg.group_id
         WHERE a.alert_id = $1
         GROUP BY fg.group_id, fg.admin_user_id;`,
        [alertId]
    );
    return result.rows[0] || { admin_user_id: null, linked: [] };
}

// Sends the alert to every user in the area who has not had it yet.
// Returns the number of new recipients.
async function notifyArea(client, alert, level, municipalityIds, excludeIds, onlyUserId = null) {
    const title = `Missing: ${alert.child_name}`.slice(0, 100);
    const place = alert.last_seen_place ? ` near ${alert.last_seen_place}` : "";
    const message = `${alert.child_name}${alert.age != null ? `, ${alert.age},` : ""} was last seen${place}. Tap to see the photo and details.`;
    const result = await client.query(
        `INSERT INTO notifications
            (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level, municipality_id)
         SELECT u.user_id, $1, $2, $3, 'alert', 'area', $4,
                CASE WHEN $5::int[] IS NULL THEN COALESCE(u.current_municipality_id, u.municipality_id)
                     WHEN u.current_municipality_id = ANY($5::int[]) THEN u.current_municipality_id
                     ELSE u.municipality_id END
         FROM users u
         WHERE ($5::int[] IS NULL
                OR u.municipality_id = ANY($5::int[])
                OR u.current_municipality_id = ANY($5::int[]))
           AND NOT (u.user_id = ANY($6::uuid[]))
           AND ($7::uuid IS NULL OR u.user_id = $7::uuid)
         ON CONFLICT (alert_id, user_id) WHERE notification_type = 'alert' DO NOTHING;`,
        [alert.alert_id, title, message, level, municipalityIds, excludeIds, onlyUserId]
    );
    return result.rowCount;
}

async function create(a) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const inserted = await client.query(
            `INSERT INTO alerts
                (created_by, member_id, municipality_id, child_name, age, gender, description,
                 photo_url, clothing_description, latitude, longitude, last_seen_place,
                 last_seen_time, status, escalation_level, last_escalated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                     ($13::timestamptz AT TIME ZONE current_setting('TimeZone')), 'active', 1, CURRENT_TIMESTAMP)
             RETURNING *;`,
            [a.created_by, a.member_id, a.municipality_id, a.child_name, a.age, a.gender, a.description,
             a.photo_url, a.clothing_description, a.latitude, a.longitude, a.last_seen_place,
             a.last_seen_time.toISOString()]
        );
        const alert = inserted.rows[0];

        await client.query(
            `INSERT INTO alert_history (alert_id, changed_by, old_status, new_status, old_level, new_level, change_description)
             VALUES ($1, $2, NULL, 'active', NULL, 1, 'Alert created');`,
            [alert.alert_id, a.created_by]
        );

        // Family first, wherever they are.
        const family = await familyOf(client, alert.alert_id);
        const linked = family.linked.filter((id) => id !== a.created_by);
        if (linked.length) {
            await client.query(
                `INSERT INTO notifications
                    (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level, municipality_id)
                 SELECT uid, $2, $3, $4, 'alert', 'family', 1, $5 FROM unnest($1::uuid[]) AS uid
                 ON CONFLICT (alert_id, user_id) WHERE notification_type = 'alert' DO NOTHING;`,
                [linked, alert.alert_id, `Family alert: ${alert.child_name} is missing`.slice(0, 100),
                 `${a.creator_name} reported ${alert.child_name} missing. Tap to see the details and help search.`,
                 alert.municipality_id]
            );
        }

        // Level 1: the origin municipality.
        await notifyArea(client, alert, 1, [alert.municipality_id], [a.created_by]);

        await client.query("COMMIT");
        return alert;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Escalates one alert by a level if it is still active and due.
// Locks the row so two servers (or two runs) never escalate the same alert twice.
// Returns { alert_id, new_level, recipients } or null when nothing was due.
async function escalateIfDue(alertId, intervalMinutes) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const due = await client.query(
            `SELECT * FROM alerts
             WHERE alert_id = $1 AND lower(status) IN ('active', 'still_missing') AND escalation_level < 4
               AND last_escalated_at <= CURRENT_TIMESTAMP - make_interval(mins => $2)
             FOR UPDATE SKIP LOCKED;`,
            [alertId, intervalMinutes]
        );
        const alert = due.rows[0];
        if (!alert) {
            await client.query("ROLLBACK");
            return null;
        }

        const newLevel = alert.escalation_level + 1;
        const areas = alert.municipality_id
            ? await municipalitiesForLevel(client, alert.municipality_id, newLevel)
            : null;
        const family = await familyOf(client, alert.alert_id);
        const familyIds = [...new Set([family.admin_user_id, ...family.linked].filter(Boolean))];

        const recipients = await notifyArea(client, alert, newLevel, areas, [alert.created_by, ...familyIds]);

        // Tell the family the search has widened (FR16).
        const areaText = newLevel === 4 ? "all LocalAlert users" : newLevel === 2 ? "neighbouring municipalities" : "a wider area";
        await client.query(
            `INSERT INTO notifications
                (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level, municipality_id)
             SELECT uid, $2, $3, $4, 'escalation', 'family', $5, $6 FROM unnest($1::uuid[]) AS uid;`,
            [familyIds, alert.alert_id, `Alert escalated to Level ${newLevel}`,
             `${alert.child_name}'s alert now reaches ${areaText}.`, newLevel, alert.municipality_id]
        );

        // Keep a fixed 6-hour rhythm from creation, even if the job ran late.
        await client.query(
            `UPDATE alerts
             SET escalation_level = $2,
                 last_escalated_at = last_escalated_at + make_interval(mins => $3),
                 updated_at = CURRENT_TIMESTAMP
             WHERE alert_id = $1;`,
            [alert.alert_id, newLevel, intervalMinutes]
        );
        await client.query(
            `INSERT INTO alert_history (alert_id, changed_by, old_status, new_status, old_level, new_level, change_description)
             VALUES ($1, NULL, $2, $2, $3, $4, $5);`,
            [alert.alert_id, alert.status, alert.escalation_level, newLevel,
             `Escalated to Level ${newLevel}; ${recipients} new recipients`]
        );

        await client.query("COMMIT");
        return { alert_id: alert.alert_id, new_level: newLevel, recipients };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function findDueForEscalation(intervalMinutes) {
    const result = await pool.query(
        `SELECT alert_id FROM alerts
         WHERE lower(status) IN ('active', 'still_missing') AND escalation_level < 4
           AND last_escalated_at <= CURRENT_TIMESTAMP - make_interval(mins => $1)
         ORDER BY last_escalated_at
         LIMIT 50;`,
        [intervalMinutes]
    );
    return result.rows.map((r) => r.alert_id);
}

async function findActiveForMember(memberId) {
    const result = await pool.query(
        `SELECT alert_id FROM alerts
         WHERE member_id = $1 AND lower(status) IN ('active', 'still_missing') LIMIT 1;`,
        [memberId]
    );
    return result.rows[0];
}

// Profile to report, with its group's administrator.
async function findProfileForAlert(memberId) {
    const result = await pool.query(
        `SELECT fm.member_id, fm.full_name, to_char(fm.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                fm.gender, fm.physical_description, fm.photo_url, fm.verification_status,
                fg.admin_user_id
         FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
         WHERE fm.member_id = $1;`,
        [memberId]
    );
    return result.rows[0];
}

async function findUserForPin(userId) {
    const result = await pool.query(
        `SELECT user_id, first_name, last_name, pin_hash FROM users WHERE user_id = $1;`,
        [userId]
    );
    return result.rows[0];
}

// The alert columns are "timestamp without time zone" holding the database's local
// time. Converting them here gives exact instants, whatever time zone Node runs in.
const tz = (column) => `(${column} AT TIME ZONE current_setting('TimeZone'))`;

const ALERT_COLUMNS = `
    a.alert_id, a.member_id, a.municipality_id, a.child_name, a.age, a.gender, a.description, a.clothing_description,
    a.last_seen_place, a.latitude, a.longitude,
    lower(a.status) AS status, a.escalation_level,
    ${tz("a.last_seen_time")} AS last_seen_time,
    ${tz("a.last_escalated_at")} AS last_escalated_at,
    ${tz("a.resolved_at")} AS resolved_at,
    ${tz("a.created_at")} AS created_at,
    (a.photo_url IS NOT NULL) AS has_photo,
    (SELECT count(*)::int FROM sighting_reports s WHERE s.alert_id = a.alert_id) AS sightings_count,
    m.municipality_name, m.province
`;

// How the user is connected to the alert: creator, family (admin or linked) or recipient.
const ACCESS = `
    (a.created_by = $2) AS is_creator,
    EXISTS (SELECT 1 FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
            WHERE fm.member_id = a.member_id AND fg.admin_user_id = $2) AS is_admin,
    EXISTS (SELECT 1 FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
            WHERE fm.member_id = a.member_id
              AND (fg.admin_user_id = $2
                   OR EXISTS (SELECT 1 FROM family_links fl WHERE fl.group_id = fg.group_id AND fl.user_id = $2))
           ) AS is_family,
    EXISTS (SELECT 1 FROM notifications n WHERE n.alert_id = a.alert_id AND n.user_id = $2) AS is_recipient
`;

async function findForUser(alertId, userId) {
    const result = await pool.query(
        `SELECT ${ALERT_COLUMNS}, a.photo_url, a.created_by, ${ACCESS}
         FROM alerts a LEFT JOIN municipalities m ON m.municipality_id = a.municipality_id
         WHERE a.alert_id = $1;`,
        [alertId, userId]
    );
    return result.rows[0];
}

// Alerts the user created, belongs to as family, or received.
async function listForUser(userId) {
    const result = await pool.query(
        `SELECT ${ALERT_COLUMNS}, ${ACCESS}
         FROM alerts a LEFT JOIN municipalities m ON m.municipality_id = a.municipality_id
         WHERE a.created_by = $2
            OR EXISTS (SELECT 1 FROM notifications n WHERE n.alert_id = a.alert_id AND n.user_id = $2)
            OR EXISTS (SELECT 1 FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
                       WHERE fm.member_id = a.member_id
                         AND (fg.admin_user_id = $2
                              OR EXISTS (SELECT 1 FROM family_links fl WHERE fl.group_id = fg.group_id AND fl.user_id = $2)))
         ORDER BY (lower(a.status) = 'resolved'), a.created_at DESC
         LIMIT $1;`,
        [100, userId]
    );
    return result.rows;
}

// Who has been told so far, and who comes next (for the family's view).
async function reach(alert, intervalMinutes) {
    const counts = await pool.query(
        `SELECT recipient_type, escalation_level, count(*)::int AS users
         FROM notifications WHERE alert_id = $1 AND notification_type = 'alert'
         GROUP BY recipient_type, escalation_level;`,
        [alert.alert_id]
    );
    const family = counts.rows.filter((r) => r.recipient_type === "family").reduce((s, r) => s + r.users, 0);
    const byLevel = {};
    for (const r of counts.rows) if (r.recipient_type === "area") byLevel[r.escalation_level] = r.users;

    const levels = [];
    const client = await pool.connect();
    try {
        for (let level = 1; level <= 4; level++) {
            let names = [];
            if (level < 4 && alert.municipality_id) {
                const ids = await municipalitiesForLevel(client, alert.municipality_id, level);
                const previous = level > 1 ? await municipalitiesForLevel(client, alert.municipality_id, level - 1) : [];
                const added = ids.filter((id) => !previous.includes(id));
                const rows = await client.query(
                    `SELECT municipality_name FROM municipalities WHERE municipality_id = ANY($1::int[]) ORDER BY municipality_name;`,
                    [added]
                );
                names = rows.rows.map((r) => r.municipality_name);
            }
            const reached = level <= alert.escalation_level;
            const open = alert.status !== "resolved";
            const scheduled = new Date(
                new Date(alert.last_escalated_at).getTime() + (level - alert.escalation_level) * intervalMinutes * 60000
            );
            levels.push({
                level,
                municipalities: names,
                users: reached ? byLevel[level] || 0 : null,
                sent_at: reached
                    ? new Date(new Date(alert.last_escalated_at).getTime() - (alert.escalation_level - level) * intervalMinutes * 60000).toISOString()
                    : null,
                status: reached ? "sent" : open ? "scheduled" : "not_needed",
                scheduled_at: reached || !open ? null : scheduled.toISOString(),
            });
        }
    } finally {
        client.release();
    }
    return { family, levels };
}

// Marks the alert as found (FR: resolve with PIN). Tells everyone who received
// it and the linked family. Returns false if it was already resolved.
async function resolve(alertId, userId) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const locked = await client.query(
            `SELECT alert_id, child_name, status, escalation_level, municipality_id FROM alerts WHERE alert_id = $1 FOR UPDATE;`,
            [alertId]
        );
        const alert = locked.rows[0];
        if (!alert || String(alert.status).toLowerCase() === "resolved") {
            await client.query("ROLLBACK");
            return false;
        }
        await client.query(
            `UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE alert_id = $1;`,
            [alertId]
        );
        await client.query(
            `INSERT INTO alert_history (alert_id, changed_by, old_status, new_status, old_level, new_level, change_description)
             VALUES ($1, $2, $3, 'resolved', $4, $4, 'Marked as found by the family administrator');`,
            [alertId, userId, alert.status, alert.escalation_level]
        );
        const family = await familyOf(client, alertId);
        await client.query(
            `INSERT INTO notifications
                (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level, municipality_id)
             SELECT DISTINCT ON (r.user_id) r.user_id, $1, $3, $4, 'resolved', r.kind, $5, $6
             FROM (
                SELECT user_id, 'family' AS kind FROM unnest($7::uuid[]) AS user_id
                UNION
                SELECT n.user_id, n.recipient_type FROM notifications n
                WHERE n.alert_id = $1 AND n.notification_type = 'alert'
             ) r
             WHERE r.user_id <> $2
             ORDER BY r.user_id, r.kind DESC
             ON CONFLICT DO NOTHING;`,
            [alertId, userId, `Found safe: ${alert.child_name}`.slice(0, 100),
             `${alert.child_name} has been found. Thank you for looking out.`,
             alert.escalation_level, alert.municipality_id,
             [...new Set([family.admin_user_id, ...family.linked].filter(Boolean))]]
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

// Alerts open for more than `days` days become "still missing" (screen 20).
// They stay open, keep escalating and still accept sightings.
async function markStillMissing(days) {
    const result = await pool.query(
        `WITH changed AS (
            UPDATE alerts SET status = 'still_missing', updated_at = CURRENT_TIMESTAMP
            WHERE lower(status) = 'active' AND created_at <= CURRENT_TIMESTAMP - make_interval(days => $1)
            RETURNING alert_id, escalation_level
         )
         INSERT INTO alert_history (alert_id, changed_by, old_status, new_status, old_level, new_level, change_description)
         SELECT alert_id, NULL, 'active', 'still_missing', escalation_level, escalation_level,
                'Missing for more than ' || $1 || ' days'
         FROM changed;`,
        [days]
    );
    return result.rowCount;
}

// ---- Sharing -------------------------------------------------------------

// Returns the alert's public share code, creating one the first time.
async function getOrCreateShareCode(alertId) {
    const crypto = require("crypto");
    for (let attempt = 0; attempt < 3; attempt++) {
        const code = crypto.randomBytes(8).toString("base64url"); // 11 characters
        const result = await pool.query(
            `UPDATE alerts SET share_code = COALESCE(share_code, $2)
             WHERE alert_id = $1
             RETURNING share_code;`,
            [alertId, code]
        ).catch((error) => {
            if (error.code === "23505") return null; // code already used: try another
            throw error;
        });
        if (result) return result.rows[0]?.share_code || null;
    }
    throw new Error("Could not create a share code.");
}

// Public view of a shared alert: only what is safe to show anyone with the link.
async function findByShareCode(code) {
    const result = await pool.query(
        `SELECT a.alert_id, a.child_name, a.age, a.gender, a.description, a.clothing_description,
                a.last_seen_place, lower(a.status) AS status, a.escalation_level, a.photo_url,
                ${tz("a.last_seen_time")} AS last_seen_time,
                ${tz("a.created_at")} AS created_at,
                ${tz("a.resolved_at")} AS resolved_at,
                m.municipality_name, m.province
         FROM alerts a LEFT JOIN municipalities m ON m.municipality_id = a.municipality_id
         WHERE a.share_code = $1;`,
        [code]
    );
    return result.rows[0];
}

// A signed-in user opened a shared link in the app: from now on they receive
// this alert like someone in the area (details, photo, sightings, "found" message).
async function followShared(alertId, userId) {
    await pool.query(
        `INSERT INTO notifications
            (user_id, alert_id, title, message, notification_type, recipient_type, escalation_level, municipality_id)
         SELECT u.user_id, a.alert_id, left('Missing: ' || a.child_name, 100),
                a.child_name || ' was shared with you. Tap to see the photo and details.',
                'alert', 'area', a.escalation_level, COALESCE(u.current_municipality_id, u.municipality_id)
         FROM alerts a, users u
         WHERE a.alert_id = $1 AND u.user_id = $2 AND lower(a.status) <> 'resolved'
           AND a.created_by <> u.user_id
           -- the family already has access and gets family notifications
           AND NOT EXISTS (
                SELECT 1 FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
                WHERE fm.member_id = a.member_id
                  AND (fg.admin_user_id = u.user_id
                       OR EXISTS (SELECT 1 FROM family_links fl WHERE fl.group_id = fg.group_id AND fl.user_id = u.user_id)))
         ON CONFLICT DO NOTHING;`,
        [alertId, userId]
    );
}

// Catch-up: a user who joined after an alert was sent, or who has moved into an
// area an open alert already covers, receives it now. Covers every open alert whose
// current search area (its level so far) includes the user's home or current
// municipality. Returns how many alerts were delivered.
async function catchUpUser(userId) {
    const client = await pool.connect();
    try {
        const open = await client.query(
            `SELECT a.alert_id, a.child_name, a.age, a.last_seen_place, a.escalation_level,
                    a.municipality_id, a.created_by
             FROM alerts a
             WHERE lower(a.status) IN ('active', 'still_missing')
               AND a.created_by <> $1
               AND NOT EXISTS (SELECT 1 FROM notifications n
                               WHERE n.alert_id = a.alert_id AND n.user_id = $1 AND n.notification_type = 'alert')
               -- the family already has the alert
               AND NOT EXISTS (
                    SELECT 1 FROM family_members fm JOIN family_groups fg ON fg.group_id = fm.group_id
                    WHERE fm.member_id = a.member_id
                      AND (fg.admin_user_id = $1
                           OR EXISTS (SELECT 1 FROM family_links fl WHERE fl.group_id = fg.group_id AND fl.user_id = $1)))`,
            [userId]
        );
        let delivered = 0;
        for (const alert of open.rows) {
            const areas = alert.escalation_level >= 4 || !alert.municipality_id
                ? null
                : await municipalitiesForLevel(client, alert.municipality_id, alert.escalation_level);
            if (areas === null && alert.escalation_level < 4) continue;
            delivered += await notifyArea(client, alert, alert.escalation_level, areas, [alert.created_by], userId);
        }
        return delivered;
    } finally {
        client.release();
    }
}

module.exports = {
    catchUpUser,
    getOrCreateShareCode,
    findByShareCode,
    followShared,
    resolve,
    markStillMissing,
    tz,
    create,
    escalateIfDue,
    findDueForEscalation,
    findActiveForMember,
    findProfileForAlert,
    findUserForPin,
    findForUser,
    listForUser,
    reach,
    municipalitiesForLevel,
};
