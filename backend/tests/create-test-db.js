/*
Keeps the test database up to date with the scripts in db/.

- Missing: it is created and every script in db/ is run, in number order.
- Exists: only scripts added to db/ since the last run are run (the names of the
  scripts already run are kept in the table test_db_scripts).
- --fresh: it is dropped and built again from scratch.

  npm run test:db               bring it up to date
  npm run test:db -- --fresh    drop and re-create it
  (npm test does the same before running the tests, and also accepts --fresh)
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

async function withClient(database, work) {
    const client = connect(database);
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.end();
    }
}

async function ensureDatabase({ fresh }) {
    return withClient("postgres", async (admin) => {
        const exists = async () => (await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb])).rowCount > 0;
        let rebuild = fresh;
        if (!rebuild && (await exists())) {
            // A test database made before scripts were tracked is rebuilt once.
            const tracked = await withClient(testDb, async (db) =>
                (await db.query("SELECT to_regclass('public.test_db_scripts') AS t")).rows[0].t !== null);
            if (!tracked) rebuild = true;
        }
        if (rebuild) await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`);
        if (!(await exists())) {
            await admin.query(`CREATE DATABASE ${testDb}`);
            return true;
        }
        return false;
    });
}

async function createTestDb({ fresh = false } = {}) {
    if (!/^[A-Za-z0-9_]+$/.test(testDb)) throw new Error(`Unexpected test database name: ${testDb}`);
    const created = await ensureDatabase({ fresh });

    return withClient(testDb, async (db) => {
        await db.query("CREATE TABLE IF NOT EXISTS test_db_scripts (name text PRIMARY KEY, run_at timestamp DEFAULT CURRENT_TIMESTAMP)");
        const done = new Set((await db.query("SELECT name FROM test_db_scripts")).rows.map((r) => r.name));
        const scripts = fs.readdirSync(DB_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
        const todo = scripts.filter((f) => !done.has(f));
        for (const file of todo) {
            // psql-only lines such as "\set ON_ERROR_STOP on" are skipped.
            const sql = fs.readFileSync(path.join(DB_DIR, file), "utf8")
                .split(/\r?\n/).filter((line) => !line.trim().startsWith("\\")).join("\n");
            try {
                await db.query(sql);
            } catch (error) {
                throw new Error(`${file}: ${error.message}`);
            }
            await db.query("INSERT INTO test_db_scripts (name) VALUES ($1)", [file]);
        }
        if (created) console.log(`Created test database ${testDb} from ${todo.length} scripts in db/`);
        else if (todo.length) console.log(`Test database ${testDb}: ran ${todo.join(", ")}`);
        return { created, ran: todo };
    });
}

module.exports = createTestDb;

if (require.main === module) {
    createTestDb({ fresh: process.argv.includes("--fresh") })
        .then(({ created, ran }) => { if (!created && !ran.length) console.log(`Test database ${testDb} is up to date.`); })
        .catch((error) => { console.error(error.message); process.exit(1); });
}
