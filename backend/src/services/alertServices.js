/*
Escalation scheduler (FR15, FR16).

Every minute it looks for active alerts whose last escalation was at least
ESCALATION_INTERVAL_MINUTES ago (6 hours by default) and moves each one up a
level: Level 2 neighbouring municipalities, Level 3 their neighbours,
Level 4 all users. Linked family members are told at each new level.

The alert's row is locked while it is escalated, so it is safe even if the
job overlaps itself or more than one server is running.
For testing, set ESCALATION_INTERVAL_MINUTES=2 in .env to escalate every 2 minutes.
*/
const Alert = require("../models/Alert");

const CHECK_EVERY_MS = 60 * 1000;
const STILL_MISSING_AFTER_DAYS = 5; // screen 20: alerts open longer than this are "still missing"
let timer = null;
let running = false;

function intervalMinutes() {
    const value = Number(process.env.ESCALATION_INTERVAL_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : 360;
}

async function runOnce() {
    if (running) return [];
    running = true;
    const done = [];
    try {
        const stillMissing = await Alert.markStillMissing(STILL_MISSING_AFTER_DAYS);
        if (stillMissing) console.log(`[escalation] ${stillMissing} alert(s) now marked as still missing`);
        const minutes = intervalMinutes();
        for (const alertId of await Alert.findDueForEscalation(minutes)) {
            try {
                const result = await Alert.escalateIfDue(alertId, minutes);
                if (result) {
                    done.push(result);
                    console.log(`[escalation] alert ${alertId.slice(0, 8)} -> Level ${result.new_level} (${result.recipients} new recipients)`);
                }
            } catch (error) {
                console.error(`[escalation] alert ${alertId.slice(0, 8)} failed:`, error.message);
            }
        }
    } catch (error) {
        console.error("[escalation] check failed:", error.message);
    } finally {
        running = false;
    }
    return done;
}

// Prints each open alert's level and when it moves up next (at start-up and hourly),
// so it is easy to see in the terminal that escalation is on track.
async function logPlan() {
    try {
        const pool = require("../config/database");
        const minutes = intervalMinutes();
        const rows = (await pool.query(
            `SELECT child_name, escalation_level,
                    (last_escalated_at AT TIME ZONE current_setting('TimeZone')) AS since
             FROM alerts WHERE lower(status) IN ('active', 'still_missing') ORDER BY created_at;`
        )).rows;
        if (!rows.length) return console.log("[escalation] no open alerts");
        const when = (d) => new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        for (const a of rows) {
            const next = new Date(new Date(a.since).getTime() + minutes * 60000);
            console.log(`[escalation] ${a.child_name}: Level ${a.escalation_level}` +
                (a.escalation_level >= 4 ? " (all users)" : `, Level ${a.escalation_level + 1} at ${when(next)}`));
        }
    } catch (error) {
        console.error("[escalation] status failed:", error.message);
    }
}

function start() {
    if (timer) return;
    console.log(`Escalation job running (every ${intervalMinutes()} minutes per level)`);
    runOnce().then(logPlan);
    timer = setInterval(runOnce, CHECK_EVERY_MS);
    setInterval(logPlan, 60 * 60 * 1000);
}

function stop() {
    clearInterval(timer);
    timer = null;
}

module.exports = { start, stop, runOnce, intervalMinutes };
