/*
Reports for a Family Administrator, built from the live data:
- familyReport: the family's alerts summed up (status, levels reached, sightings,
  people alerted, time until found) and one row per alert.
- alertReport: one alert from start to end (timeline of levels, sightings, who was told).
Alerts belong to the family through the reported profile (alerts.member_id), so alerts
reported by someone the administrator shared responsibility with are included.
*/
const pool = require("../config/database");
const { distanceKm } = require("../utils/distance");

const tz = (column) => `(${column} AT TIME ZONE current_setting('TimeZone'))`;
const round1 = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 10) / 10);

const ALERT_ROW = `
    a.alert_id, a.child_name, lower(a.status) AS status, a.escalation_level,
    ${tz("a.created_at")} AS created_at, ${tz("a.resolved_at")} AS resolved_at,
    mu.municipality_name, a.last_seen_place,
    trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS reported_by,
    EXTRACT(EPOCH FROM (coalesce(a.resolved_at, LOCALTIMESTAMP) - a.created_at)) / 3600 AS hours_open,
    (SELECT count(*) FROM sighting_reports s WHERE s.alert_id = a.alert_id)::int AS sightings,
    (SELECT count(DISTINCT n.user_id) FROM notifications n
      WHERE n.alert_id = a.alert_id AND n.notification_type = 'alert')::int AS people_alerted`;

const FROM_FAMILY = `
    FROM alerts a
    JOIN family_members fm ON fm.member_id = a.member_id
    LEFT JOIN municipalities mu ON mu.municipality_id = a.municipality_id
    LEFT JOIN users u ON u.user_id = a.created_by`;

function shapeAlert(r) {
    return { ...r, hours_open: round1(r.hours_open) };
}

async function familyReport(group) {
    const [profiles, links, alerts] = await Promise.all([
        pool.query(
            `SELECT count(*)::int AS profiles,
                    count(*) FILTER (WHERE verification_status = 'verified')::int AS verified
             FROM family_members WHERE group_id = $1`,
            [group.group_id]
        ),
        pool.query(`SELECT count(*)::int AS linked FROM family_links WHERE group_id = $1`, [group.group_id]),
        pool.query(`SELECT ${ALERT_ROW} ${FROM_FAMILY} WHERE fm.group_id = $1 ORDER BY a.created_at DESC`, [group.group_id]),
    ]);

    const rows = alerts.rows.map(shapeAlert);
    const found = rows.filter((a) => a.status === "resolved");
    const byLevel = [1, 2, 3, 4].map((level) => ({
        level,
        alerts: rows.filter((a) => a.escalation_level >= level).length, // reached this level
    }));

    return {
        generated_at: new Date().toISOString(),
        group_name: group.group_name,
        summary: {
            profiles: profiles.rows[0].profiles,
            verified_profiles: profiles.rows[0].verified,
            linked_members: links.rows[0].linked,
            alerts: rows.length,
            active: rows.filter((a) => a.status === "active").length,
            still_missing: rows.filter((a) => a.status === "still_missing").length,
            found: found.length,
            sightings: rows.reduce((s, a) => s + a.sightings, 0),
            people_alerted: rows.reduce((s, a) => s + a.people_alerted, 0),
            average_hours_to_found: found.length
                ? round1(found.reduce((s, a) => s + a.hours_open, 0) / found.length)
                : null,
        },
        by_level: byLevel,
        alerts: rows,
    };
}

// One alert of this family, or null.
async function alertReport(groupId, alertId) {
    const head = await pool.query(
        `SELECT ${ALERT_ROW}, a.latitude, a.longitude, a.contact_number
         ${FROM_FAMILY} WHERE fm.group_id = $1 AND a.alert_id = $2`,
        [groupId, alertId]
    );
    if (!head.rows.length) return null;
    const alert = shapeAlert(head.rows[0]);

    const [history, sightings, told] = await Promise.all([
        pool.query(
            `SELECT h.old_status, h.new_status, h.old_level, h.new_level, h.change_description,
                    ${tz("h.updated_at")} AS at,
                    trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) AS by
             FROM alert_history h LEFT JOIN users u ON u.user_id = h.changed_by
             WHERE h.alert_id = $1 ORDER BY h.updated_at, h.history_id`,
            [alertId]
        ),
        pool.query(
            `SELECT ${tz("s.reported_at")} AS reported_at, s.description, (s.photo_url IS NOT NULL) AS has_photo,
                    s.latitude, s.longitude, u.first_name AS reported_by
             FROM sighting_reports s LEFT JOIN users u ON u.user_id = s.user_id
             WHERE s.alert_id = $1 ORDER BY s.reported_at`,
            [alertId]
        ),
        pool.query(
            `SELECT recipient_type, escalation_level, count(DISTINCT user_id)::int AS users
             FROM notifications WHERE alert_id = $1 AND notification_type = 'alert'
             GROUP BY recipient_type, escalation_level`,
            [alertId]
        ),
    ]);

    // Timeline: reported, each level reached, found.
    const timeline = [{ at: alert.created_at, event: `Reported missing by ${alert.reported_by}. Level 1: ${alert.municipality_name || "their area"}.` }];
    for (const h of history.rows) {
        if (h.new_level && h.old_level && h.new_level > h.old_level) {
            timeline.push({ at: h.at, event: `Moved to Level ${h.new_level}${h.new_level === 4 ? " (all LocalAlert users)" : ""}.` });
        } else if (h.new_status && h.new_status.toLowerCase() === "resolved") {
            timeline.push({ at: h.at, event: `Marked as found${h.by ? ` by ${h.by}` : ""}.` });
        } else if (h.new_status && h.new_status.toLowerCase() === "still_missing" && h.old_status !== h.new_status) {
            timeline.push({ at: h.at, event: "Marked as still missing." });
        }
    }
    if (alert.resolved_at && !timeline.some((t) => /found/.test(t.event))) {
        timeline.push({ at: alert.resolved_at, event: "Marked as found." });
    }
    timeline.sort((x, y) => new Date(x.at) - new Date(y.at));

    const hasPlace = alert.latitude !== null && alert.longitude !== null;
    return {
        generated_at: new Date().toISOString(),
        alert: {
            alert_id: alert.alert_id,
            child_name: alert.child_name,
            status: alert.status,
            escalation_level: alert.escalation_level,
            created_at: alert.created_at,
            resolved_at: alert.resolved_at,
            hours_open: alert.hours_open,
            municipality_name: alert.municipality_name,
            last_seen_place: alert.last_seen_place,
            reported_by: alert.reported_by,
            contact_number: alert.contact_number,
        },
        people_alerted: {
            total: alert.people_alerted,
            family: told.rows.filter((r) => r.recipient_type === "family").reduce((s, r) => s + r.users, 0),
            by_level: [1, 2, 3, 4].map((level) => ({
                level,
                users: told.rows.filter((r) => r.recipient_type === "area" && r.escalation_level === level).reduce((s, r) => s + r.users, 0),
            })),
        },
        timeline,
        sightings: sightings.rows.map((s) => ({
            reported_at: s.reported_at,
            description: s.description,
            has_photo: s.has_photo,
            reported_by: s.reported_by,
            km_from_last_seen: hasPlace && s.latitude !== null && s.longitude !== null
                ? round1(distanceKm(Number(alert.latitude), Number(alert.longitude), Number(s.latitude), Number(s.longitude)))
                : null,
        })),
    };
}

module.exports = { familyReport, alertReport };
