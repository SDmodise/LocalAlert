const Alert = require("../models/Alert");
const Sighting = require("../models/Sighting");
const Notification = require("../models/Notification");
const spatialService = require("../services/spatialService");
const escalation = require("../services/escalationService");
const { requirePin } = require("../services/pinService");
const { absolutePath, storedPath, removeUploaded } = require("../middleware/uploadMiddleware");
const { distanceKm } = require("../utils/distance");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


function fail(res, status, message, extra = {}) {
    return res.status(status).json({ success: false, message, ...extra });
}

function serverError(res, label, error) {
    console.error(`${label}:`, error.message);
    return fail(res, 500, "Something went wrong. Please try again.");
}

function ageFrom(dob) {
    const [y, m, d] = dob.split("-").map(Number);
    const now = new Date();
    let age = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
    return Math.max(age, 0);
}

function toAlert(row) {
    return {
        alert_id: row.alert_id,
        member_id: row.member_id,
        child_name: row.child_name,
        age: row.age,
        gender: row.gender,
        description: row.description,
        clothing_description: row.clothing_description,
        last_seen_place: row.last_seen_place,
        last_seen_time: row.last_seen_time,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        status: row.status,
        escalation_level: row.escalation_level,
        municipality_name: row.municipality_name,
        province: row.province,
        has_photo: row.has_photo,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        next_escalation_at:
            row.status !== "resolved" && row.escalation_level < 4
                ? new Date(new Date(row.last_escalated_at).getTime() + escalation.intervalMinutes() * 60000).toISOString()
                : null,
        relation: row.is_creator ? "creator" : row.is_family ? "family" : "recipient",
        can_resolve: Boolean(row.is_admin || row.is_creator) && row.status !== "resolved",
        // Sighting numbers are for the family only.
        sightings_count: row.is_creator || row.is_family ? row.sightings_count : undefined,
    };
}

// Checks the PIN (shared wrong-attempt lock, see services/pinService.js).
// Sends the error response and returns null when the PIN is not accepted.
const pinAccepted = (req, res, pin) => requirePin(req, res, pin);

// POST /api/alerts
// { member_id, latitude, longitude, last_seen_place?, last_seen_time (ISO), clothing_description, pin }
// Accepts JSON, or multipart with an optional new "photo" (a recent photo taken
// when reporting). Without a new photo, the profile's photo is used.
async function create(req, res) {
    const newPhoto = req.files?.photo?.[0];
    // If the alert is not created, delete the uploaded photo again.
    res.on("finish", () => {
        if (newPhoto && res.statusCode !== 201) removeUploaded(req);
    });
    return createAlert(req, res, newPhoto);
}

async function createAlert(req, res, newPhoto) {
    try {
        const body = req.body || {};
        const memberId = String(body.member_id || "");
        const latitude = Number(body.latitude);
        const longitude = Number(body.longitude);
        const place = String(body.last_seen_place || "").trim().slice(0, 150) || null;
        const clothing = String(body.clothing_description || "").trim();
        const pin = String(body.pin || "");
        const seenAt = new Date(body.last_seen_time);

        if (!UUID.test(memberId)) return fail(res, 400, "Choose who is missing.");
        const profile = await Alert.findProfileForAlert(memberId);
        if (!profile) return fail(res, 404, "That profile no longer exists.");
        if (profile.admin_user_id !== req.user.id) {
            return fail(res, 403, "You can only report people from your own family group.");
        }
        if (profile.verification_status !== "verified") {
            return fail(res, 400, "Only verified profiles can be used in an alert. Add a valid ID number to this profile first.");
        }
        if (!spatialService.isValidCoordinate(latitude, longitude)) {
            return fail(res, 400, "Add the last known location.");
        }
        if (Number.isNaN(seenAt.getTime())) return fail(res, 400, "Enter when the person was last seen.");
        if (seenAt.getTime() > Date.now() + 5 * 60 * 1000) {
            return fail(res, 400, "The last seen time cannot be in the future.");
        }
        if (seenAt.getTime() < Date.now() - 30 * 24 * 3600 * 1000) {
            return fail(res, 400, "The last seen time must be within the last 30 days.");
        }
        if (clothing.length < 3 || clothing.length > 500) {
            return fail(res, 400, "Describe what they were wearing (3 to 500 characters).");
        }

        // PIN last, so a wrong PIN is only counted for an otherwise valid alert.
        const user = await pinAccepted(req, res, pin);
        if (!user) return;

        const municipality = await spatialService.findMunicipality(latitude, longitude);
        if (!municipality) {
            return fail(res, 422, "This location is outside the area LocalAlert covers. Call SAPS on 10111.");
        }
        if (await Alert.findActiveForMember(memberId)) {
            return fail(res, 409, `There is already an active alert for ${profile.full_name}.`);
        }

        const created = await Alert.create({
            created_by: req.user.id,
            creator_name: `${user.first_name} ${user.last_name}`.trim(),
            member_id: memberId,
            municipality_id: municipality.municipality_id,
            child_name: profile.full_name,
            age: ageFrom(profile.date_of_birth),
            gender: profile.gender,
            description: profile.physical_description,
            photo_url: newPhoto ? storedPath(newPhoto) : profile.photo_url,
            clothing_description: clothing,
            latitude,
            longitude,
            last_seen_place: place,
            last_seen_time: seenAt,
        });

        const row = await Alert.findForUser(created.alert_id, req.user.id);
        res.status(201).json({
            success: true,
            alert: toAlert(row),
            reach: await Alert.reach(row, escalation.intervalMinutes()),
        });
    } catch (error) {
        serverError(res, "Creating alert failed", error);
    }
}

// GET /api/alerts
async function list(req, res) {
    try {
        // Alerts already open in the user's area that they have not received yet
        // (e.g. they joined or arrived after the alert was sent).
        await Alert.catchUpUser(req.user.id);
        const rows = await Alert.listForUser(req.user.id);
        res.status(200).json({ success: true, alerts: rows.map(toAlert) });
    } catch (error) {
        serverError(res, "Loading alerts failed", error);
    }
}

async function loadAllowed(req, res) {
    if (!UUID.test(req.params.alertId)) {
        fail(res, 404, "Alert not found.");
        return null;
    }
    const row = await Alert.findForUser(req.params.alertId, req.user.id);
    if (!row) {
        fail(res, 404, "Alert not found.");
        return null;
    }
    if (!row.is_creator && !row.is_family && !row.is_recipient) {
        fail(res, 403, "You have not received this alert.");
        return null;
    }
    return row;
}

// GET /api/alerts/:alertId
async function get(req, res) {
    try {
        const row = await loadAllowed(req, res);
        if (!row) return;
        // Opening the alert counts as reading its notifications.
        await Notification.markAlertRead(req.user.id, row.alert_id);
        const result = { success: true, alert: toAlert(row) };
        if (row.is_creator || row.is_family) {
            result.reach = await Alert.reach(row, escalation.intervalMinutes());
        }
        res.status(200).json(result);
    } catch (error) {
        serverError(res, "Loading alert failed", error);
    }
}

// GET /api/alerts/:alertId/photo
async function photo(req, res) {
    try {
        const row = await loadAllowed(req, res);
        if (!row) return;
        if (!row.photo_url) return fail(res, 404, "Photo not found.");
        res.set("Cache-Control", "private, max-age=300");
        res.sendFile(absolutePath(row.photo_url), (error) => {
            if (error && !res.headersSent) fail(res, 404, "Photo not found.");
        });
    } catch (error) {
        serverError(res, "Loading photo failed", error);
    }
}


// POST /api/alerts/:alertId/resolve  { pin }   (family administrator)
async function resolve(req, res) {
    try {
        const row = await loadAllowed(req, res);
        if (!row) return;
        if (!row.is_admin && !row.is_creator) {
            return fail(res, 403, "Only the family administrator can mark this person as found.");
        }
        if (row.status === "resolved") return fail(res, 409, "This alert has already been resolved.");
        if (!(await pinAccepted(req, res, req.body?.pin))) return;
        if (!(await Alert.resolve(row.alert_id, req.user.id))) {
            return fail(res, 409, "This alert has already been resolved.");
        }
        const updated = await Alert.findForUser(row.alert_id, req.user.id);
        res.status(200).json({ success: true, message: `${updated.child_name} has been marked as found.`, alert: toAlert(updated) });
    } catch (error) {
        serverError(res, "Resolving alert failed", error);
    }
}

const MAX_SIGHTINGS_PER_USER = 20;

// POST /api/alerts/:alertId/sightings  (multipart: description?, latitude?, longitude?, photo?)
async function addSighting(req, res) {
    const reject = (status, message) => {
        removeUploaded(req);
        return fail(res, status, message);
    };
    try {
        const row = await loadAllowed(req, res);
        if (!row) return removeUploaded(req);
        if (row.status === "resolved") return reject(409, `${row.child_name} has already been found.`);

        const description = String(req.body?.description || "").trim();
        const hasLocation = req.body?.latitude !== undefined && req.body?.latitude !== "";
        const latitude = hasLocation ? Number(req.body.latitude) : null;
        const longitude = hasLocation ? Number(req.body.longitude) : null;
        const photo = req.files?.photo?.[0];

        if (description.length > 500) return reject(400, "Keep the description under 500 characters.");
        if (hasLocation && !spatialService.isValidCoordinate(latitude, longitude)) {
            return reject(400, "Your location could not be read. Try again or describe the place instead.");
        }
        if (!description && !hasLocation && !photo) {
            return reject(400, "Add at least one: your location, a description or a photo.");
        }
        if ((await Sighting.countByUser(row.alert_id, req.user.id)) >= MAX_SIGHTINGS_PER_USER) {
            return reject(429, "You have sent many reports for this alert. If it is urgent, call SAPS on 10111.");
        }

        const me = await Alert.findUserForPin(req.user.id);
        const report = await Sighting.create({
            alert_id: row.alert_id,
            user_id: req.user.id,
            description: description || null,
            photo_url: storedPath(photo),
            latitude,
            longitude,
            reporter_name: me?.first_name || "Someone",
            child_name: row.child_name,
        });
        res.status(201).json({
            success: true,
            message: "Thank you. Your report was sent to the family.",
            report: { report_id: report.report_id, reported_at: report.reported_at },
        });
    } catch (error) {
        removeUploaded(req);
        serverError(res, "Sending sighting failed", error);
    }
}

// GET /api/alerts/:alertId/sightings  (family only)
async function listSightings(req, res) {
    try {
        const row = await loadAllowed(req, res);
        if (!row) return;
        if (!row.is_creator && !row.is_family) return fail(res, 403, "Only the family can see sighting reports.");
        const rows = await Sighting.listForAlert(row.alert_id);
        const hasOrigin = row.latitude !== null && row.longitude !== null;
        res.status(200).json({
            success: true,
            sightings: rows.map((r) => {
                const lat = r.latitude === null ? null : Number(r.latitude);
                const lon = r.longitude === null ? null : Number(r.longitude);
                return {
                    report_id: r.report_id,
                    description: r.description,
                    latitude: lat,
                    longitude: lon,
                    distance_km: lat !== null && hasOrigin
                        ? Math.round(distanceKm(Number(row.latitude), Number(row.longitude), lat, lon) * 10) / 10
                        : null,
                    has_photo: r.has_photo,
                    reporter: r.reporter_first_name || "A LocalAlert user",
                    reported_at: r.reported_at,
                };
            }),
        });
    } catch (error) {
        serverError(res, "Loading sightings failed", error);
    }
}

// GET /api/alerts/:alertId/sightings/:reportId/photo  (family only)
async function sightingPhoto(req, res) {
    try {
        const row = await loadAllowed(req, res);
        if (!row) return;
        if (!row.is_creator && !row.is_family) return fail(res, 403, "Only the family can see sighting photos.");
        if (!UUID.test(req.params.reportId)) return fail(res, 404, "Photo not found.");
        const stored = await Sighting.findPhoto(row.alert_id, req.params.reportId);
        if (!stored) return fail(res, 404, "Photo not found.");
        res.set("Cache-Control", "private, max-age=300");
        res.sendFile(absolutePath(stored), (error) => {
            if (error && !res.headersSent) fail(res, 404, "Photo not found.");
        });
    } catch (error) {
        serverError(res, "Loading photo failed", error);
    }
}

module.exports = { create, list, get, photo, resolve, addSighting, listSightings, sightingPhoto };
