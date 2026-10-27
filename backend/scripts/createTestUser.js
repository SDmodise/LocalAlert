/*
Creates a test account so the login screen can be tried before sign-up exists.

Usage (from the backend folder):
  node scripts/createTestUser.js <email> <password> [role]
  role: "Family Administrator" (default) or "Community Member"
*/
require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../src/config/database");

async function main() {
    const [email, password, role = "Family Administrator"] = process.argv.slice(2);
    if (!email || !password) {
        console.log('Usage: node scripts/createTestUser.js <email> <password> ["Family Administrator" | "Community Member"]');
        process.exit(1);
    }

    const roleResult = await pool.query("SELECT role_id FROM roles WHERE role_name = $1", [role]);
    if (roleResult.rows.length === 0) {
        throw new Error(`Role "${role}" not found in the roles table.`);
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
        `INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone_number)
         VALUES ($1, 'Test', 'User', $2, $3, '0712345678')
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
         RETURNING user_id, email`,
        [roleResult.rows[0].role_id, email.trim().toLowerCase(), hash]
    );

    console.log(`Test user ready: ${result.rows[0].email} (${role})`);
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
