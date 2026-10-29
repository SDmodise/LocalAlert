const User = require("../models/User");
const spatialService = require("../services/spatialService");
const Alert = require("../models/Alert");
const bcrypt = require("bcrypt");
const { deleteStoredFiles } = require("../middleware/uploadMiddleware");

// Wrong-password protection for deleting an account: 5 tries, then 15 minutes.
const deleteAttempts = new Map();

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
        const entry = deleteAttempts.get(req.user.id);
        if (entry?.lockedUntil > Date.now()) {
            return res.status(429).json({ success: false, message: "Too many wrong passwords. Try again in 15 minutes." });
        }
        const hash = await User.findPasswordHash(req.user.id);
        if (!hash) return res.status(404).json({ success: false, message: "Your account could not be found." });

        const password = String(req.body?.password || "");
        if (!password || !(await bcrypt.compare(password, hash))) {
            const next = { count: (entry?.count || 0) + 1, lockedUntil: 0 };
            if (next.count >= 5) next.lockedUntil = Date.now() + 15 * 60 * 1000;
            deleteAttempts.set(req.user.id, next);
            // 403, not 401: a wrong password here must not log the user out.
            return res.status(403).json({ success: false, message: "Incorrect password." });
        }
        deleteAttempts.delete(req.user.id);

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

module.exports = { getMe, updateLocation, deleteMe };
