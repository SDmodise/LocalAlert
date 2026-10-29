/*
npm test: makes sure the test database exists, then runs every *.test.js file
one after another and prints a summary. Exit code 1 if any test fails.
*/
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const createTestDb = require("./create-test-db");

(async () => {
    await createTestDb();
    const only = process.argv[2];
    const files = fs.readdirSync(__dirname)
        .filter((f) => f.endsWith(".test.js") && (!only || f.includes(only)))
        .sort();
    const results = [];
    for (const file of files) {
        console.log(`\n=== ${file}`);
        const run = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: "inherit" });
        results.push({ file, ok: run.status === 0 });
    }
    console.log("\n=== Summary");
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.file}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed} of ${results.length} test files passed`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
