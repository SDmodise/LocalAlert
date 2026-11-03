/*
npm run check-email -- you@example.com

Finds out why a LocalAlert email (e.g. a password reset code) did not arrive:
1. Are the SMTP settings in .env filled in?
2. Does an account use this email address? (Reset codes only go to account emails.)
3. Was a reset code asked for too recently? (1 per minute, 5 per hour.)
4. Sends a test email and shows Gmail's real answer.
No passwords are printed.
*/
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const pool = require("../src/config/database");
const emailService = require("../src/services/emailService");

const to = String(process.argv[2] || "").trim().toLowerCase();

(async () => {
    if (!to || !to.includes("@")) {
        console.log("Usage: npm run check-email -- you@example.com");
        process.exit(1);
    }

    console.log("1. Email settings (.env)");
    const pass = String(process.env.SMTP_PASS || "").replace(/\s/g, "");
    console.log(`   SMTP_HOST ${process.env.SMTP_HOST || "(empty)"}, SMTP_PORT ${process.env.SMTP_PORT || "(empty, 465 used)"}`);
    console.log(`   SMTP_USER ${process.env.SMTP_USER || "(empty)"}`);
    console.log(`   SMTP_PASS ${pass ? `${pass.length} characters${pass.length === 16 ? " (right length for a Gmail app password)" : " (a Gmail app password has 16 letters)"}` : "(empty)"}`);
    if (!emailService.isConfigured()) {
        console.log("   -> Not set up: LocalAlert prints reset codes in the backend window instead of emailing them.");
    }

    console.log(`\n2. Account for ${to}`);
    let user = null;
    try {
        user = (await pool.query("SELECT user_id, first_name FROM users WHERE lower(email) = $1", [to])).rows[0];
        console.log(user
            ? `   Found (${user.first_name}). Reset codes can be sent to this address.`
            : "   -> No account uses this email, so Forgot password sends nothing (on purpose, for privacy).\n      Use the exact email you signed up with.");
    } catch (error) {
        console.log(`   Could not check the database: ${error.message}`);
    }

    if (user) {
        console.log("\n3. Recent reset codes");
        try {
            const r = (await pool.query(
                `SELECT count(*)::int AS n,
                        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - max(created_at)))::int AS ago
                 FROM password_reset_codes
                 WHERE user_id = $1 AND created_at > CURRENT_TIMESTAMP - interval '1 hour'`,
                [user.user_id]
            )).rows[0];
            if (!r.n) console.log("   None in the last hour.");
            else {
                console.log(`   ${r.n} in the last hour, the newest ${Math.round(r.ago / 60)} minute(s) ago.`);
                if (r.n >= 5) console.log("   -> Limit reached (5 an hour): new requests send nothing until an hour has passed.");
                else if (r.ago < 60) console.log("   -> Asked less than a minute ago: wait a minute before asking again.");
            }
        } catch (error) {
            console.log(`   Could not check: ${error.message}`);
        }
    }

    console.log(`\n4. Sending a test email to ${to} ...`);
    if (!emailService.isConfigured()) {
        console.log("   Skipped: fill in SMTP_HOST, SMTP_USER and SMTP_PASS in .env first.");
    } else {
        try {
            await emailService.sendTestEmail(to);
            console.log("   Sent. Look in the inbox, and in Spam / Promotions, for \"LocalAlert test email\".");
        } catch (error) {
            console.log(`   FAILED: ${error.message}`);
            if (/Invalid login|BadCredentials|535/.test(error.message)) {
                console.log("   -> Gmail refused the login: create a new app password for localalert.app@gmail.com and put it in SMTP_PASS.");
            } else if (/timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(error.message)) {
                console.log("   -> Could not reach Gmail: check the internet connection, or try another network (port 465 may be blocked).");
            }
        }
    }
    await pool.end();
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
