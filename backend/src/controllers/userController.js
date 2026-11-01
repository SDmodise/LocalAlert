const User = require("../models/User");
const spatialService = require("../services/spatialService");
const Alert = require("../models/Alert");
const bcrypt = require("bcrypt");
const { deleteStoredFiles } = require("../middleware/uploadMiddleware");
const pinService = require("../services/pinService");
const emailService = require("../services/emailService");

// Wrong-password protection for actions that ask for the password again
// (deleting the account, changing a forgotten PIN): 5 tries, then 15 minutes.
const passwordAttempts = new Map();

// Returns null when the password is right, otherwise { status, message }.
async function checkPassword(userId, password) {
    const entry = passwordAttempts.get(userId);
    if (entry?.lockedUntil > Date.now()) {
        return { status: 429, message: "Too many wrong passwords. Try again in 15 minutes." };
    }
    const hash = await User.findPasswordHash(userId);
    if (!hash) return { status: 404, message: "Your account could not be found." };
    if (!password || !(await bcrypt.compare(String(password), hash))) {
        const next = { count: (entry?.count || 0) + 1, lockedUntil: 0 };
        if (next.count >= 5) next.lockedUntil = Date.now() + 15 * 60 * 1000;
        passwordAttempts.set(userId, next);
        // 403, not 401: a wrong password here must not log the user out.
        return next.lockedUntil
            ? { status: 429, message: "Too many wrong passwords. Try again in 15 minutes." }
            : { status: 403, message: "Incorrect password." };
    }
    passwordAttempts.delete(userId);
    return null;
}

function toProfile(row) {
    return {
        user_id: row.user_id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone_number: row.phone_number,
        role: row.role,
        home_municipality: row.home_municipality,
        home_province: row.home_province,
        current_municipality: row.current_municipality,
        last_location_at: row.last_location_at,
        created_at: row.created_at,
    };
}

// GET /api/users/me
async function getMe(req, res) {
    try {
        const row = await User.findProfileById(req.user.id);
        if (!row) {
            return res.status(401).json({ success: false, message: "Your account could not be found. Please log in again." });
        }
        res.status(200).json({ success: true, user: toProfile(row) });
    } catch (error) {
        console.error("Loading profile failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

// PUT /api/users/me/location  { latitude, longitude }
// Only the municipality is saved; the coordinates are discarded (NFR22).
async function updateLocation(req, res) {
    try {
        const latitude = Number(req.body?.latitude);
        const longitude = Number(req.body?.longitude);
        if (!spatialService.isValidCoordinate(latitude, longitude)) {
            return res.status(400).json({ success: false, message: "A valid location is required." });
        }

        const municipality = await spatialService.findMunicipality(latitude, longitude);
        await User.updateCurrentMunicipality(req.user.id, municipality ? municipality.municipality_id : null);
        // Now in a new area: receive any open alerts that already cover it.
        await Alert.catchUpUser(req.user.id).catch((e) => console.error("Alert catch-up failed:", e.message));

        const row = await User.findProfileById(req.user.id);
        res.status(200).json({ success: true, user: toProfile(row) });
    } catch (error) {
        console.error("Updating location failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

// DELETE /api/users/me   { password }
// Permanently deletes the account (POPIA: the right to have personal information deleted).
async function deleteMe(req, res) {
    try {
        const problem = await checkPassword(req.user.id, req.body?.password);
        if (problem) return res.status(problem.status).json({ success: false, message: problem.message });

        const open = await User.countOpenAlertsCreatedBy(req.user.id);
        if (open > 0) {
            return res.status(409).json({
                success: false,
                message: "You have an open alert. Mark the person as found before deleting your account.",
            });
        }

        const { files } = await User.deleteAccount(req.user.id);
        deleteStoredFiles(files);
        res.status(200).json({ success: true, message: "Your account and personal information have been deleted." });
    } catch (error) {
        console.error("Deleting account failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

// PUT /api/users/me/pin   { current_pin, new_pin }  or  { password, new_pin }
// Family Administrators change the PIN that confirms alerts and profile changes.
// The password route is for a forgotten PIN (and also works while PIN entry is locked).
async function changePin(req, res) {
    try {
        const newPin = String(req.body?.new_pin ?? "");
        if (!/^[0-9]{4}$/.test(newPin)) {
            return res.status(400).json({ success: false, message: "Your new PIN must be exactly 4 digits." });
        }

        const usingPassword = typeof req.body?.password === "string" && req.body.password !== "";
        if (usingPassword) {
            const problem = await checkPassword(req.user.id, req.body.password);
            if (problem) return res.status(problem.status).json({ success: false, message: problem.message });
        } else {
            const check = await pinService.verifyPin(req.user.id, req.body?.current_pin);
            if (!check.ok) {
                return res.status(check.status).json({ success: false, message: check.message, ...(check.code ? { code: check.code } : {}) });
            }
        }

        const currentHash = await User.findPinHash(req.user.id);
        if (currentHash && (await bcrypt.compare(newPin, currentHash))) {
            return res.status(400).json({ success: false, message: "Choose a PIN that is different from your current PIN." });
        }

        await User.updatePinHash(req.user.id, await bcrypt.hash(newPin, 10));
        pinService.clearPinLock(req.user.id);

        if (emailService.isConfigured()) {
            const me = await User.findProfileById(req.user.id);
            if (me) emailService.sendPinChangedEmail({ to: me.email, firstName: me.first_name });
        }
        res.status(200).json({ success: true, message: "Your PIN has been changed." });
    } catch (error) {
        console.error("Changing PIN failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

module.exports = { getMe, updateLocation, deleteMe, changePin };
