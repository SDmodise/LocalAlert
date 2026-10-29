/*
Creates the test database (if it does not exist yet) and runs every script in db/ on it,
in number order. Pass --fresh to drop it and start again, e.g. after adding a migration.

  npm run test:db           create it if missing
  npm run test:db -- --fresh  drop and re-create it
*/
const fs = require("fs");
const path = require("path");
require("./setup");
const { Client } = require("pg");

const DB_DIR = path.resolve(__dirname, "..", "..", "db");
const testDb = process.env.DB_NAME;

const connect = (database) => new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
});

async function createTestDb({ fresh = false } = {}) {
    if (!/^[A-Za-z0-9_]+$/.test(testDb)) throw new Error(`Unexpected test database name: ${testDb}`);
    const admin = connect("postgres");
    await admin.connect();
    try {
        if (fresh) await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
        const exists = (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb])).rowCount > 0;
        if (exists) return false;
        await admin.query(`CREATE DATABASE ${testDb}`);
    } finally {
        await admin.end();
    }

    const db = connect(testDb);
    await db.connect();
    try {
        const scripts = fs.readdirSync(DB_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
        for (const file of scripts) {
            // psql-only lines such as "\set ON_ERROR_STOP on" are skipped.
            const sql = fs.readFileSync(path.join(DB_DIR, file), "utf8")
                .split(/\r?\n/).filter((line) => !line.trim().startsWith("\\")).join("\n");
            try {
                await db.query(sql);
            } catch (error) {
                throw new Error(`${file}: ${error.message}`);
            }
        }
        console.log(`Created test database ${testDb} from ${scripts.length} scripts in db/`);
    } finally {
        await db.end();
    }
    return true;
}

module.exports = createTestDb;

if (require.main === module) {
    createTestDb({ fresh: process.argv.includes("--fresh") })
        .then((created) => { if (!created) console.log(`Test database ${testDb} already exists (use --fresh to rebuild it).`); })
        .catch((error) => { console.error(error.message); process.exit(1); });
}
