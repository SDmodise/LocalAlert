/*
Checks a Family Administrator's 4-digit PIN for sensitive actions
(sending an alert, marking someone found, editing or removing a profile).
Wrong attempts are counted per user across all these actions:
5 wrong attempts lock PIN actions for 15 minutes.
*/
const bcrypt = require("bcrypt");
const pool = require("../config/database");

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;
const pinAttempts = new Map(); // userId -> { count, lockedUntil }

function lockedMinutes(userId) {
    const entry = pinAttempts.get(userId);
    if (entry?.lockedUntil && entry.lockedUntil > Date.now()) {
        return Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    }
    if (entry?.lockedUntil) pinAttempts.delete(userId);
    return 0;
}

function recordWrongPin(userId) {
    const entry = pinAttempts.get(userId) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= PIN_MAX_ATTEMPTS) entry.lockedUntil = Date.now() + PIN_LOCK_MS;
    pinAttempts.set(userId, entry);
    return PIN_MAX_ATTEMPTS - entry.count;
}

// Returns { ok: true, user } or { ok: false, status, message, code? }.
async function verifyPin(userId, pin) {
    const locked = lockedMinutes(userId);
    if (locked) {
        return { ok: false, status: 429, message: `Too many wrong PIN attempts. Try again in ${locked} minute${locked === 1 ? "" : "s"}.` };
    }
    const result = await pool.query(
        `SELECT user_id, first_name, last_name, pin_hash FROM users WHERE user_id = $1;`,
        [userId]
    );
    const user = result.rows[0];
    if (!user?.pin_hash) return { ok: false, status: 400, message: "Set a PIN on your account first." };
    if (!/^[0-9]{4}$/.test(String(pin || "")) || !(await bcrypt.compare(String(pin), user.pin_hash))) {
        const left = recordWrongPin(userId);
        return left > 0
            ? { ok: false, status: 403, message: `Incorrect PIN. ${left} attempt${left === 1 ? "" : "s"} left.`, code: "WRONG_PIN" }
            : { ok: false, status: 429, message: "Too many wrong PIN attempts. Try again in 15 minutes.", code: "WRONG_PIN" };
    }
    pinAttempts.delete(userId);
    return { ok: true, user };
}

// Express helper: sends the error response and returns null when the PIN is not accepted.
async function requirePin(req, res, pin) {
    const check = await verifyPin(req.user.id, pin);
    if (check.ok) return check.user;
    res.status(check.status).json({ success: false, message: check.message, ...(check.code ? { code: check.code } : {}) });
    return null;
}

module.exports = { verifyPin, requirePin };
