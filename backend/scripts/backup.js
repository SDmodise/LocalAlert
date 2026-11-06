/*
npm run backup

Backs up LocalAlert: the whole database and the uploaded photos, into a new folder
in localalert-mobile/backups/ named after the date and time. Restore one with
"npm run restore". Backups hold personal information: they are kept out of git.
*/
const { makeBackup, describe, BACKUP_DIR } = require("./backup-tools");
const pool = require("../src/config/database");

(async () => {
    console.log("Backing up the LocalAlert database and uploaded photos…");
    const { name, info } = await makeBackup(pool);
    console.log(`\n  Backup saved: backups\\${name}`);
    console.log(`  It holds ${describe(info)}.`);
    console.log(`  Folder: ${BACKUP_DIR}`);
    console.log("\n  To restore it later: npm run restore");
})()
    .catch((error) => {
        console.error(`\nThe backup failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
