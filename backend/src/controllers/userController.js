const User = require("../models/User");
const spatialService = require("../services/spatialService");

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

        const row = await User.findProfileById(req.user.id);
        res.status(200).json({ success: true, user: toProfile(row) });
    } catch (error) {
        console.error("Updating location failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

module.exports = { getMe, updateLocation };
