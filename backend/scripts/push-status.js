/*
npm run push-status                      which accounts have a phone registered for notifications
npm run push-status -- you@example.com   also sends a test notification to that account's phones
                                         and shows whether Expo/Firebase delivered it

Use it when lock-screen notifications do not appear. Nothing secret is printed
(push tokens are shortened).
*/
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const pool = require("../src/config/database");

const EXPO = "https://exp.host/--/api/v2/push";
const email = String(process.argv[2] || "").trim().toLowerCase();
const short = (token) => token.replace(/^(Expo(?:nent)?PushToken\[)(.{6}).*(\])$/, "$1$2…$3");
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

const EXPLAIN = {
    DeviceNotRegistered: "The app was uninstalled or logged out on that phone. Open LocalAlert and log in again.",
    InvalidCredentials: "Expo has no working Firebase key for this app. Run \"eas credentials\" in frontend > Android > development > Google Service Account > FCM V1, and upload the firebase-adminsdk key.",
    MismatchSenderId: "google-services.json is from a different Firebase project than the key uploaded to Expo. Use files from the same project, then rebuild.",
    MessageTooBig: "The notification is too large.",
    MessageRateExceeded: "Too many notifications to this phone in a short time. Wait and try again.",
};

function headers() {
    const h = { Accept: "application/json", "Content-Type": "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) h.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    return h;
}

(async () => {
    console.log("1. Database");
    const table = (await pool.query("SELECT to_regclass('public.push_tokens') AS t")).rows[0].t;
    const trigger = (await pool.query("SELECT 1 FROM pg_trigger WHERE tgname = 'trg_announce_notification'")).rowCount > 0;
    if (!table || !trigger) {
        console.log("   -> Missing: run db/012_push_notifications.sql on this database, then restart the backend.");
        return;
    }
    console.log("   push_tokens table and notification trigger: OK");

    console.log("\n2. Phones registered for notifications");
    const rows = (await pool.query(
        `SELECT u.email, u.first_name, p.token, p.platform,
                to_char(p.last_seen_at, 'DD Mon HH24:MI') AS seen
         FROM push_tokens p JOIN users u ON u.user_id = p.user_id
         ORDER BY u.email, p.last_seen_at DESC`
    )).rows;
    if (!rows.length) {
        console.log("   None. A phone registers when someone logs in to the LocalAlert app (not Expo Go on Android)");
        console.log("   and taps Allow for notifications. Reload the app, check Android Settings > Apps > LocalAlert >");
        console.log("   Notifications is on, and look for \"[push]\" messages in the Expo terminal.");
    }
    for (const r of rows) console.log(`   ${r.email} (${r.first_name}): ${r.platform || "?"} ${short(r.token)}, registered ${r.seen}`);

    if (!email) {
        console.log("\nTo send a test notification: npm run push-status -- someone@example.com");
        return;
    }

    console.log(`\n3. Test notification to ${email}`);
    const tokens = rows.filter((r) => r.email.toLowerCase() === email).map((r) => r.token);
    if (!tokens.length) {
        console.log("   -> This account has no phone registered (see step 2).");
        return;
    }
    const messages = tokens.map((to) => ({
        to,
        title: "LocalAlert test notification",
        body: "If you can see this, lock-screen notifications work.",
        sound: "default",
        priority: "high",
        channelId: "alerts",
        data: { type: "test" },
    }));
    let tickets;
    try {
        const response = await fetch(`${EXPO}/send`, { method: "POST", headers: headers(), body: JSON.stringify(messages) });
        const json = await response.json();
        if (!response.ok || !Array.isArray(json.data)) {
            console.log(`   -> Expo refused the request (${response.status}): ${JSON.stringify(json.errors || json).slice(0, 300)}`);
            return;
        }
        tickets = json.data;
    } catch (error) {
        console.log(`   -> Could not reach Expo: ${error.message}. Check the laptop's internet connection.`);
        return;
    }
    const ids = [];
    tickets.forEach((t, i) => {
        if (t.status === "ok") {
            ids.push(t.id);
            console.log(`   ${short(tokens[i])}: accepted by Expo`);
        } else {
            const code = t.details?.error;
            console.log(`   ${short(tokens[i])}: REFUSED - ${t.message}${code ? ` (${code})` : ""}`);
            if (EXPLAIN[code]) console.log(`     -> ${EXPLAIN[code]}`);
        }
    });
    if (!ids.length) return;

    console.log("\n4. Delivery to Firebase / the phone (checking in 6 seconds)…");
    await wait(6000);
    try {
        const response = await fetch(`${EXPO}/getReceipts`, { method: "POST", headers: headers(), body: JSON.stringify({ ids }) });
        const receipts = (await response.json()).data || {};
        for (const id of ids) {
            const r = receipts[id];
            if (!r) console.log("   Not confirmed yet (that's normal for a few minutes). Check the phone.");
            else if (r.status === "ok") console.log("   Delivered to Firebase. It should be on the phone now (lock the phone to see it pop up).");
            else {
                const code = r.details?.error;
                console.log(`   FAILED - ${r.message}${code ? ` (${code})` : ""}`);
                if (EXPLAIN[code]) console.log(`     -> ${EXPLAIN[code]}`);
            }
        }
    } catch (error) {
        console.log(`   Could not check: ${error.message}`);
    }
})()
    .catch((error) => console.error(error.message))
    .finally(() => pool.end());
