/*
Shared by "npm run backup" and "npm run restore".

A backup is one folder in localalert-mobile/backups/, named after its date and time:
  database.dump   the whole database (PostgreSQL custom format, made by pg_dump)
  uploads/        the photos and ID documents people uploaded
  info.json       when it was made and what it holds (shown when restoring)

The database settings come from backend/.env. The password is passed to pg_dump and
pg_restore in their environment, never on the command line and never printed.
*/
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const BACKEND = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND, ".env"), quiet: true });

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(BACKEND, "..", "backups"));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(BACKEND, "uploads"));
const DB_NAME = process.env.DB_NAME;

// pg_dump / pg_restore: PG_BIN in .env, else the newest "C:\Program Files\PostgreSQL\<n>\bin"
// on Windows, else whatever is on the PATH.
function pgTool(name) {
    const exe = process.platform === "win32" ? `${name}.exe` : name;
    if (process.env.PG_BIN) return path.join(process.env.PG_BIN, exe);
    if (process.platform === "win32") {
        const root = path.join(process.env.ProgramFiles || "C:\\Program Files", "PostgreSQL");
        if (fs.existsSync(root)) {
            const versions = fs.readdirSync(root)
                .filter((v) => fs.existsSync(path.join(root, v, "bin", exe)))
                .sort((a, b) => parseFloat(b) - parseFloat(a));
            if (versions.length) return path.join(root, versions[0], "bin", exe);
        }
    }
    return exe;
}

// Runs pg_dump or pg_restore; resolves when it succeeds, rejects with its error output.
function runPg(name, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(pgTool(name), [
            "-h", process.env.DB_HOST || "localhost",
            "-p", String(process.env.DB_PORT || 5432),
            "-U", process.env.DB_USER || "postgres",
            ...args,
        ], { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || "" }, stdio: ["ignore", "ignore", "pipe"] });
        let errors = "";
        child.stderr.on("data", (d) => { errors += d.toString(); });
        child.on("error", (error) => {
            if (error.code === "ENOENT") {
                reject(new Error(`${name} was not found. Set PG_BIN in backend/.env to PostgreSQL's bin folder, e.g. PG_BIN=C:\\Program Files\\PostgreSQL\\18\\bin`));
            } else reject(error);
        });
        child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(errors.trim() || `${name} stopped with code ${code}`))));
    });
}

function countFiles(dir) {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        n += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1;
    }
    return n;
}

const stamp = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};

// Makes a backup; returns { folder, info }. prefix: e.g. "before-restore_".
async function makeBackup(pool, { prefix = "" } = {}) {
    if (!DB_NAME) throw new Error("DB_NAME is not set in backend/.env.");
    let name = `${prefix}${stamp()}`;
    if (fs.existsSync(path.join(BACKUP_DIR, name))) name += `_${Date.now() % 1000}`;
    const folder = path.join(BACKUP_DIR, name);
    fs.mkdirSync(folder, { recursive: true });
    try {
        await runPg("pg_dump", ["-d", DB_NAME, "-F", "c", "-f", path.join(folder, "database.dump")]);
        if (fs.existsSync(UPLOAD_DIR)) fs.cpSync(UPLOAD_DIR, path.join(folder, "uploads"), { recursive: true });
        const counts = (await pool.query(
            `SELECT (SELECT count(*) FROM users)::int AS users,
                    (SELECT count(*) FROM alerts)::int AS alerts,
                    (SELECT count(*) FROM family_members)::int AS profiles,
                    (SELECT count(*) FROM sighting_reports)::int AS sightings`
        )).rows[0];
        const info = { created_at: new Date().toISOString(), database: DB_NAME, ...counts, files: countFiles(path.join(folder, "uploads")) };
        fs.writeFileSync(path.join(folder, "info.json"), JSON.stringify(info, null, 2));
        return { folder, name, info };
    } catch (error) {
        fs.rmSync(folder, { recursive: true, force: true }); // never leave a half-made backup
        throw error;
    }
}

// Backups, newest first: [{ name, folder, info }]
function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(BACKUP_DIR, e.name, "database.dump")))
        .map((e) => {
            const folder = path.join(BACKUP_DIR, e.name);
            let info = {};
            try { info = JSON.parse(fs.readFileSync(path.join(folder, "info.json"), "utf8")); } catch { /* no info */ }
            const made = info.created_at ? new Date(info.created_at).getTime() : fs.statSync(folder).mtimeMs;
            return { name: e.name, folder, info, made };
        })
        .sort((a, b) => b.made - a.made);
}

const describe = (info) => (info && info.users !== undefined
    ? `${info.users} users, ${info.alerts} alerts, ${info.profiles} profiles, ${info.sightings} sightings, ${info.files} photos/files`
    : "contents not recorded");

// Puts a backup back: the database (replacing every table) and the uploaded files.
async function restoreBackup(backup) {
    await runPg("pg_restore", [
        "-d", DB_NAME, "--clean", "--if-exists", "--no-owner",
        "--single-transaction", "--exit-on-error",
        path.join(backup.folder, "database.dump"),
    ]);
    const saved = path.join(backup.folder, "uploads");
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
    if (fs.existsSync(saved)) fs.cpSync(saved, UPLOAD_DIR, { recursive: true });
    else fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

module.exports = { BACKUP_DIR, UPLOAD_DIR, DB_NAME, makeBackup, listBackups, restoreBackup, describe };
