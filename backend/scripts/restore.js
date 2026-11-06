/*
npm run restore                 lists the backups and asks which one to restore
npm run restore -- --latest     restores the newest backup (still asks to confirm)
npm run restore -- <name>       restores that backup, e.g. 2026-11-06_11-20-05
  add --yes to skip the confirmation (used by the tests)

Restoring replaces ALL current data (database and uploaded photos) with the backup.
To make that safe, the current data is backed up first ("before-restore_…"), so a
restore can itself be undone by restoring that backup.
Stop the backend first if you can; with "npm run dev" running it also works.
*/
const readline = require("readline/promises");
const { makeBackup, listBackups, restoreBackup, describe } = require("./backup-tools");
const pool = require("../src/config/database");

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const named = args.find((a) => !a.startsWith("--"));

const when = (b) => (b.info.created_at
    ? new Date(b.info.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
    : b.name);

(async () => {
    const backups = listBackups();
    if (!backups.length) {
        console.log("There are no backups yet. Make one with: npm run backup");
        return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // No keyboard (input closed): count it as no answer, so nothing is restored.
    const closed = new Promise((resolve) => rl.once("close", () => resolve("")));
    const ask = (question) => Promise.race([rl.question(question), closed]);
    try {
        let chosen;
        if (named) {
            chosen = backups.find((b) => b.name === named);
            if (!chosen) throw new Error(`No backup called "${named}". Run "npm run restore" to see the list.`);
        } else if (args.includes("--latest")) {
            chosen = backups[0];
        } else {
            console.log("Backups (newest first):\n");
            backups.forEach((b, i) => console.log(`  ${i + 1}. ${when(b)}  (${b.name})\n     ${describe(b.info)}`));
            const answer = (await ask(`\nWhich backup do you want to restore? (1-${backups.length}, or Enter to cancel) `)).trim();
            const n = Number(answer);
            if (!answer) return console.log("Cancelled. Nothing was changed.");
            if (!Number.isInteger(n) || n < 1 || n > backups.length) throw new Error("That is not one of the numbers in the list. Nothing was changed.");
            chosen = backups[n - 1];
        }

        console.log(`\nRestoring ${when(chosen)} (${describe(chosen.info)})`);
        console.log("replaces ALL current data and photos. The current data is backed up first.");
        if (!yes) {
            const confirm = (await ask('Type "yes" to restore: ')).trim().toLowerCase();
            if (confirm !== "yes") return console.log("Cancelled. Nothing was changed.");
        }

        const safety = await makeBackup(pool, { prefix: "before-restore_" });
        console.log(`  Current data saved first: backups\\${safety.name}`);
        await restoreBackup(chosen);

        const now = (await pool.query(
            `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM alerts)::int AS alerts,
                    (SELECT count(*) FROM family_members)::int AS profiles, (SELECT count(*) FROM sighting_reports)::int AS sightings`
        )).rows[0];
        console.log(`\n  Restored. The database now has ${now.users} users, ${now.alerts} alerts, ${now.profiles} profiles and ${now.sightings} sightings.`);
        console.log("  Reload the app (press r in the Expo window) to see it.");
        console.log(`  To undo this restore: npm run restore -- ${safety.name}`);
    } finally {
        rl.close();
    }
})()
    .catch((error) => {
        console.error(`\nThe restore failed: ${error.message}`);
        console.error("Because the restore runs as one transaction, the database was left as it was.");
        process.exitCode = 1;
    })
    .finally(() => pool.end());
