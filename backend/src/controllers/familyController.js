const Family = require("../models/Family");
const { validateIdNumber } = require("../services/idValidator");
const { storedPath, absolutePath, removeUploaded } = require("../middleware/uploadMiddleware");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^[A-Za-zÀ-ÿ' .-]{2,100}$/;

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function serverError(res, label, error) {
    console.error(`${label}:`, error.message);
    return fail(res, 500, "Something went wrong. Please try again.");
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toProfile(row) {
    return {
        member_id: row.member_id,
        full_name: row.full_name,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        physical_description: row.physical_description,
        has_photo: row.has_photo,
        has_id_document: row.has_id_document,
        verification_status: row.verification_status,
        created_at: row.created_at,
    };
}

// GET /api/family-groups/mine
async function getMyGroup(req, res) {
    try {
        const group = await Family.findGroupByAdmin(req.user.id);
        if (!group) return res.status(200).json({ success: true, group: null, profiles: [], members: [] });

        const [profiles, members] = await Promise.all([
            Family.listProfiles(group.group_id),
            Family.listLinkedMembers(group.group_id),
        ]);
        res.status(200).json({
            success: true,
            group: { group_id: group.group_id, group_name: group.group_name },
            profiles: profiles.map(toProfile),
            members,
        });
    } catch (error) {
        serverError(res, "Loading family group failed", error);
    }
}

// POST /api/family-groups  { group_name }
async function createGroup(req, res) {
    try {
        const name = String(req.body?.group_name || "").trim();
        if (name.length < 2 || name.length > 100) {
            return fail(res, 400, "Enter a group name between 2 and 100 characters.");
        }
        if (await Family.findGroupByAdmin(req.user.id)) {
            return fail(res, 409, "You already have a family group.");
        }
        const group = await Family.createGroup(req.user.id, name);
        res.status(201).json({ success: true, group: { group_id: group.group_id, group_name: group.group_name } });
    } catch (error) {
        serverError(res, "Creating family group failed", error);
    }
}

// POST /api/family-groups/:groupId/profiles  (multipart: fields + photo + id_document)
async function addProfile(req, res) {
    const reject = (status, message) => {
        removeUploaded(req);
        return fail(res, status, message);
    };

    try {
        const group = await Family.findGroupByAdmin(req.user.id);
        if (!group || group.group_id !== req.params.groupId) {
            return reject(403, "You can only add profiles to your own family group.");
        }

        const fullName = String(req.body.full_name || "").trim();
        const dob = String(req.body.date_of_birth || "").trim();
        const gender = req.body.gender;
        const description = String(req.body.physical_description || "").trim();
        const idNumber = String(req.body.id_number || "").replace(/\s/g, "");
        const photo = req.files?.photo?.[0];
        const idDocument = req.files?.id_document?.[0];

        if (!NAME.test(fullName)) return reject(400, "Enter the person's full name.");
        if (!isValidDate(dob)) return reject(400, "Enter a valid date of birth.");
        const today = new Date().toISOString().slice(0, 10);
        if (dob > today || dob < "1900-01-01") return reject(400, "The date of birth cannot be in the future.");
        if (gender !== "Female" && gender !== "Male") return reject(400, "Choose the person's gender.");
        if (description.length < 5 || description.length > 1000) {
            return reject(400, "Describe the person in 5 to 1000 characters (height, build, hair, marks).");
        }
        if (!photo) return reject(400, "Add a recent photo of the person.");
        if (!idDocument) return reject(400, "Upload a photo of the ID document or birth certificate.");

        // FR7 / FR37: verified only when the ID number passes the check and a document is uploaded.
        // The ID number is checked here and then discarded (NFR24).
        let status = "pending";
        if (idNumber) {
            const check = validateIdNumber(idNumber, dob, gender);
            if (!check.valid) return reject(400, check.reason);
            status = "verified";
        }

        const profile = await Family.createProfile({
            group_id: group.group_id,
            full_name: fullName,
            date_of_birth: dob,
            gender,
            physical_description: description,
            photo_url: storedPath(photo),
            id_document_url: storedPath(idDocument),
            verification_status: status,
        });

        res.status(201).json({ success: true, profile: toProfile(profile) });
    } catch (error) {
        removeUploaded(req);
        serverError(res, "Adding profile failed", error);
    }
}

// GET /api/family-members/:memberId/photo  (group administrator or linked member)
async function getPhoto(req, res) {
    try {
        if (!UUID.test(req.params.memberId)) return fail(res, 404, "Photo not found.");
        const access = await Family.findProfileAccess(req.params.memberId, req.user.id);
        if (!access || !access.photo_url) return fail(res, 404, "Photo not found.");
        if (!access.is_admin && !access.is_linked) return fail(res, 403, "You are not allowed to see this photo.");
        res.set("Cache-Control", "private, max-age=300");
        res.sendFile(absolutePath(access.photo_url), (error) => {
            if (error && !res.headersSent) fail(res, 404, "Photo not found.");
        });
    } catch (error) {
        serverError(res, "Loading photo failed", error);
    }
}

// GET /api/family-members/:memberId/id-document  (group administrator only, NFR10)
async function getIdDocument(req, res) {
    try {
        if (!UUID.test(req.params.memberId)) return fail(res, 404, "Document not found.");
        const access = await Family.findProfileAccess(req.params.memberId, req.user.id);
        if (!access || !access.id_document_url) return fail(res, 404, "Document not found.");
        if (!access.is_admin) return fail(res, 403, "Only the family administrator can see ID documents.");
        res.set("Cache-Control", "no-store");
        res.sendFile(absolutePath(access.id_document_url), (error) => {
            if (error && !res.headersSent) fail(res, 404, "Document not found.");
        });
    } catch (error) {
        serverError(res, "Loading ID document failed", error);
    }
}

module.exports = { getMyGroup, createGroup, addProfile, getPhoto, getIdDocument };
