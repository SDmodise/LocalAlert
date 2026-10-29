/*
Shows the escalation status of every open alert, straight from the database.
  npm run escalation-status          (look only)
  npm run escalation-status -- --run (also escalate anything that is due, now)
*/
require("dotenv").config({ quiet: true });
const pool = require("../src/config/database");
const escalation = require("../src/services/escalationService");

const sast = (d) => new Date(d).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "medium", timeStyle: "short" });

(async () => {
    const minutes = escalation.intervalMinutes();
    const clock = (await pool.query(
        `SELECT now() AS db_now, current_setting('TimeZone') AS db_tz, LOCALTIMESTAMP::text AS db_local`
    )).rows[0];
    console.log("Escalation interval:", minutes, "minutes", process.env.ESCALATION_INTERVAL_MINUTES ? "(from .env)" : "(default 6 hours)");
    console.log("Database time zone :", clock.db_tz, "| database clock:", clock.db_local);
    console.log("This computer      :", new Date().toString());

    const open = (await pool.query(
        `SELECT alert_id, child_name, lower(status) AS status, escalation_level,
                (created_at AT TIME ZONE current_setting('TimeZone')) AS created_at,
                (last_escalated_at AT TIME ZONE current_setting('TimeZone')) AS last_escalated_at,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_escalated_at))::int / 60 AS minutes_since,
                (last_escalated_at <= CURRENT_TIMESTAMP - make_interval(mins => $1)) AS due
         FROM alerts
         WHERE lower(status) IN ('active', 'still_missing')
         ORDER BY created_at;`,
        [minutes]
    )).rows;

    if (!open.length) console.log("\nNo open alerts. (Alerts that are resolved do not escalate.)");
    for (const a of open) {
        const next = new Date(new Date(a.last_escalated_at).getTime() + minutes * 60000);
        console.log(`\n${a.child_name}  [${a.status}]  Level ${a.escalation_level}`);
        console.log(`  created            ${sast(a.created_at)}`);
        console.log(`  level ${a.escalation_level} since      ${sast(a.last_escalated_at)}  (${a.minutes_since} min ago)`);
        console.log(a.escalation_level >= 4
            ? "  next level         none (Level 4 reaches everyone)"
            : `  next level         ${sast(next)}  ${a.due ? "<-- DUE NOW" : ""}`);
    }

    if (process.argv.includes("--run")) {
        const done = await escalation.runOnce();
        console.log(`\nRan the escalation check now: ${done.length} alert(s) escalated.`);
        for (const d of done) console.log(`  ${d.alert_id.slice(0, 8)} -> Level ${d.new_level} (${d.recipients} new recipients)`);
    }
    await pool.end();
})().catch(async (e) => {
    console.error("Status check failed:", e.message);
    await pool.end().catch(() => {});
    process.exit(1);
});
