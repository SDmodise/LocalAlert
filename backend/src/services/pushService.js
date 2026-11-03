/*
Lock-screen notifications through Expo's push service (which uses Firebase Cloud
Messaging on Android).

Every new row in notifications is announced by a database trigger (migration 012).
This service listens for those announcements, waits half a second to collect the
ones that belong together (one alert can reach hundreds of people at once), and
sends them to Expo in batches of 100.

The text on the lock screen never contains a name or a place (privacy notice:
"Push notifications contain no personal details"); the details are in the app.
Phones whose token Expo no longer accepts are removed.
*/
const { Client } = require("pg");
const PushToken = require("../models/PushToken");

const CHANNEL = "localalert_notifications";
const DEFAULT_EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
const BATCH_DELAY_MS = 500;
const RECONNECT_MS = 5000;

function textFor({ type, recipient }) {
    switch (type) {
        case "alert":
            return recipient === "family"
                ? { title: "⚠️ Family alert", body: "Someone in your family group has been reported missing. Open LocalAlert now." }
                : { title: "⚠️ Missing person near you", body: "Someone has been reported missing in your area. Open LocalAlert to see the photo and how to help." };
        case "escalation":
            return { title: "The search has widened", body: "Your family's alert now reaches more people. Open LocalAlert for the latest." };
        case "spotted_report":
            return { title: "New sighting reported", body: "Someone may have seen your missing family member. Open LocalAlert to see the report." };
        case "resolved":
            return { title: "Found safe", body: "A person you were alerted about has been found. Thank you for looking out." };
        default:
            return { title: "LocalAlert", body: "You have a new notification. Open LocalAlert to see it." };
    }
}

// Builds one push per phone for each announcement (the same user/alert/type only once).
function buildMessages(events, tokens) {
    const byUser = new Map();
    for (const { token, user_id: userId } of tokens) {
        if (!byUser.has(userId)) byUser.set(userId, []);
        byUser.get(userId).push(token);
    }
    const seen = new Set();
    const messages = [];
    for (const event of events) {
        const key = `${event.user_id}|${event.alert_id}|${event.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { title, body } = textFor(event);
        for (const to of byUser.get(event.user_id) || []) {
            messages.push({
                to,
                title,
                body,
                sound: "default",
                priority: "high",
                channelId: "alerts",
                data: { alertId: event.alert_id, type: event.type },
            });
        }
    }
    return messages;
}

// Sends to Expo in batches of 100. Returns { sent, failed, removed }.
async function send(messages) {
    const result = { sent: 0, failed: 0, removed: 0 };
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        try {
            const response = await fetch(process.env.EXPO_PUSH_URL || DEFAULT_EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(batch) });
            const json = await response.json().catch(() => null);
            if (!response.ok || !Array.isArray(json?.data)) {
                result.failed += batch.length;
                console.error(`[push] Expo refused ${batch.length} message(s):`, response.status, JSON.stringify(json?.errors || json).slice(0, 300));
                continue;
            }
            const gone = [];
            json.data.forEach((ticket, index) => {
                if (ticket.status === "ok") result.sent += 1;
                else {
                    result.failed += 1;
                    if (ticket.details?.error === "DeviceNotRegistered") gone.push(batch[index].to);
                    else console.error("[push] not sent:", ticket.message || ticket.details?.error);
                }
            });
            if (gone.length) {
                await PushToken.removeMany(gone);
                result.removed += gone.length;
            }
        } catch (error) {
            result.failed += batch.length;
            console.error("[push] could not reach Expo:", error.message);
        }
    }
    return result;
}

// Sends one push to every phone of these users (e.g. a family invitation). Never throws.
async function sendToUsers(userIds, { title, body, data = {} }) {
    try {
        const tokens = await PushToken.forUsers([...new Set(userIds)]);
        if (!tokens.length) return { sent: 0, failed: 0, removed: 0 };
        return await send(tokens.map(({ token }) => ({
            to: token, title, body, data, sound: "default", priority: "high", channelId: "alerts",
        })));
    } catch (error) {
        console.error("[push] failed:", error.message);
        return { sent: 0, failed: userIds.length, removed: 0 };
    }
}

let queue = [];
let timer = null;

async function flush() {
    timer = null;
    const events = queue;
    queue = [];
    if (!events.length) return null;
    const tokens = await PushToken.forUsers([...new Set(events.map((e) => e.user_id))]);
    const messages = buildMessages(events, tokens);
    if (!messages.length) return { sent: 0, failed: 0, removed: 0 };
    const result = await send(messages);
    console.log(`[push] ${result.sent} sent${result.failed ? `, ${result.failed} failed` : ""}${result.removed ? `, ${result.removed} old phone(s) removed` : ""}`);
    return result;
}

function enqueue(event) {
    if (!event?.user_id) return;
    queue.push(event);
    if (!timer) timer = setTimeout(() => flush().catch((e) => console.error("[push] failed:", e.message)), BATCH_DELAY_MS);
}

// ---- listening for new notifications ------------------------------------------

let listener = null;
let stopped = false;
let warnedNoTrigger = false;

async function start() {
    stopped = false;
    if (listener) return;
    const client = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    listener = client;
    const retry = (error) => {
        if (listener !== client) return;
        listener = null;
        client.end().catch(() => {});
        if (!stopped) {
            if (error) console.error("[push] lost the database connection, retrying:", error.message);
            setTimeout(() => start().catch(() => {}), RECONNECT_MS);
        }
    };
    client.on("error", retry);
    client.on("end", () => retry());
    client.on("notification", (msg) => {
        if (msg.channel !== CHANNEL) return;
        try {
            enqueue(JSON.parse(msg.payload));
        } catch {
            // ignore anything that is not ours
        }
    });
    try {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
        const hasTrigger = (await client.query(
            "SELECT 1 FROM pg_trigger WHERE tgname = 'trg_announce_notification'"
        )).rowCount > 0;
        if (!hasTrigger && !warnedNoTrigger) {
            warnedNoTrigger = true;
            console.log("[push] Run db/012_push_notifications.sql to turn on lock-screen notifications.");
        } else if (hasTrigger) {
            console.log("Push notifications: on");
        }
    } catch (error) {
        retry(error);
    }
}

async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const client = listener;
    listener = null;
    if (client) await client.end().catch(() => {});
}

function isValidToken(token) {
    return typeof token === "string" && token.length <= 200 && TOKEN_PATTERN.test(token);
}

module.exports = { start, stop, flush, send, sendToUsers, buildMessages, textFor, isValidToken };
