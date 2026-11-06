/*
Backup and restore (npm run backup / npm run restore), on the TEST database and the
test uploads folder, with backups in a temporary folder.
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { BE } = require("./setup");
const pool = require(BE + "/src/config/database");

let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  ", n)) : (fail++, console.log("  FAIL", n, x === undefined ? "" : JSON.stringify(x).slice(0, 400))); };

const BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "localalert-backups-"));
const env = { ...process.env, BACKUP_DIR };
const run = (script, args = []) => {
    try {
        return { ok: true, out: execFileSync(process.execPath, [path.join(BE, "scripts", script), ...args], { env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input: "" }) };
    } catch (e) {
        return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}` };
    }
};

(async () => {
    const uploads = process.env.UPLOAD_DIR;
    const tag = Date.now();
    const email = `backuptest-${tag}@x.co`;
    await pool.query(`DELETE FROM users WHERE email LIKE 'backuptest-%'`);
    const role = (await pool.query(`SELECT role_id FROM roles WHERE role_name = 'Community Member'`)).rows[0].role_id;
    await pool.query(
        `INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone_number) VALUES ($1,'Kept','Backup',$2,'x','0712345678')`,
        [role, email]
    );
    fs.mkdirSync(path.join(uploads, "profiles"), { recursive: true });
    fs.writeFileSync(path.join(uploads, "profiles", `kept-${tag}.jpg`), "photo");

    console.log("Backup");
    let r = run("backup.js");
    check("npm run backup succeeds", r.ok && /Backup saved/.test(r.out), r.out);
    const made = fs.readdirSync(BACKUP_DIR);
    check("one dated backup folder", made.length === 1 && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(made[0]), made);
    const folder = path.join(BACKUP_DIR, made[0]);
    check("database.dump written", fs.statSync(path.join(folder, "database.dump")).size > 1000);
    check("photos copied", fs.existsSync(path.join(folder, "uploads", "profiles", `kept-${tag}.jpg`)));
    const info = JSON.parse(fs.readFileSync(path.join(folder, "info.json"), "utf8"));
    check("info.json counts users", info.users >= 1 && info.files >= 1, info);

    // Something goes wrong after the backup: the user and the photo are deleted, new junk is added.
    await pool.query(`DELETE FROM users WHERE email = $1`, [email]);
    fs.rmSync(path.join(uploads, "profiles", `kept-${tag}.jpg`));
    fs.writeFileSync(path.join(uploads, "profiles", `junk-${tag}.jpg`), "junk");

    console.log("Restore");
    r = run("restore.js", ["--latest"]);
    check("without confirmation nothing is restored", /Cancelled/.test(r.out) && (await pool.query(`SELECT 1 FROM users WHERE email=$1`, [email])).rowCount === 0, r.out);
    r = run("restore.js", ["no-such-backup", "--yes"]);
    check("unknown backup name refused", !r.ok && /No backup called/.test(r.out), r.out);
    r = run("restore.js", ["--latest", "--yes"]);
    check("npm run restore succeeds", r.ok && /Restored/.test(r.out), r.out);
    check("deleted user is back", (await pool.query(`SELECT 1 FROM users WHERE email=$1`, [email])).rowCount === 1);
    check("deleted photo is back", fs.existsSync(path.join(uploads, "profiles", `kept-${tag}.jpg`)));
    check("files added after the backup are gone", !fs.existsSync(path.join(uploads, "profiles", `junk-${tag}.jpg`)));
    const safety = fs.readdirSync(BACKUP_DIR).find((n) => n.startsWith("before-restore_"));
    check("current data was backed up before restoring", !!safety && fs.existsSync(path.join(BACKUP_DIR, safety, "database.dump")), fs.readdirSync(BACKUP_DIR));
    check("app still works after restore (escalation trigger table present)",
        (await pool.query(`SELECT 1 FROM pg_trigger WHERE tgname = 'trg_announce_notification'`)).rowCount === 1);

    console.log("Undo the restore");
    r = run("restore.js", [safety, "--yes"]);
    check("restoring the before-restore backup works", r.ok && (await pool.query(`SELECT 1 FROM users WHERE email=$1`, [email])).rowCount === 0, r.out);

    await pool.query(`DELETE FROM users WHERE email LIKE 'backuptest-%'`);
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    console.log(`\n${pass} passed, ${fail} failed`);
    await pool.end();
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
