const Family = require("../models/Family");
const { requirePin } = require("../services/pinService");
const { validateIdNumber } = require("../services/idValidator");
const fs = require("fs");
const { storedPath, absolutePath, removeUploaded, deleteStoredFiles } = require("../middleware/uploadMiddleware");

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

        // FR7 / FR37: verified when the ID number passes the check (format, date of birth,
        // gender, citizenship digit, Luhn). The ID document photo is optional.
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

// GET /api/family-groups/linked   (any user: the families they are linked to)
// Read-only: group name, administrator, profiles and the other linked members.
async function getLinkedGroups(req, res) {
    try {
        const groups = await Family.listLinkedGroups(req.user.id);
        const result = await Promise.all(groups.map(async (g) => {
            const [profiles, members] = await Promise.all([
                Family.listProfiles(g.group_id),
                Family.listLinkedMembers(g.group_id),
            ]);
            return {
                group_id: g.group_id,
                group_name: g.group_name,
                administrator: `${g.admin_first_name} ${g.admin_last_name}`.trim(),
                linked_at: g.linked_at,
                profiles: profiles.map(toProfile),
                members: members.map((m) => ({ user_id: m.user_id, first_name: m.first_name, last_name: m.last_name })),
            };
        }));
        res.status(200).json({ success: true, groups: result });
    } catch (error) {
        serverError(res, "Loading linked families failed", error);
    }
}

function deleteFile(stored) {
    if (!stored) return;
    try {
        fs.unlink(absolutePath(stored), () => {});
    } catch {
        // invalid path: nothing to delete
    }
}

// DELETE /api/family-members/:memberId   (the group's administrator)
// Removes a profile, its ID document and (unless an alert still shows it) its photo.
async function removeProfile(req, res) {
    try {
        if (!UUID.test(req.params.memberId)) return fail(res, 404, "Profile not found.");
        const profile = await Family.findProfileGroup(req.params.memberId);
        if (!profile) return fail(res, 404, "Profile not found.");
        if (profile.admin_user_id !== req.user.id) {
            return fail(res, 403, "Only the family administrator can remove profiles.");
        }
        if (await Family.hasOpenAlert(profile.member_id)) {
            return fail(res, 409, `${profile.full_name} has an open alert. Mark them as found before removing the profile.`);
        }
        const removed = await Family.deleteProfile(profile.member_id);
        if (removed) {
            deleteFile(removed.id_document_url); // ID documents are never kept (NFR10)
            if (!(await Family.photoUsedByAlert(removed.photo_url))) deleteFile(removed.photo_url);
        }
        res.status(200).json({ success: true, message: `${profile.full_name}'s profile was removed.` });
    } catch (error) {
        serverError(res, "Removing profile failed", error);
    }
}

// DELETE /api/family-groups/:groupId/links/:userId
//   administrator: removes a linked family member
//   "me":          a linked member leaves the family
async function removeLinkedMember(req, res) {
    try {
        if (!UUID.test(req.params.groupId)) return fail(res, 404, "Family group not found.");
        const group = await Family.findGroup(req.params.groupId);
        if (!group) return fail(res, 404, "Family group not found.");

        const leaving = !req.params.userId || req.params.userId === "me"; // /links/me has no :userId
        const userId = leaving ? req.user.id : req.params.userId;
        if (!UUID.test(userId)) return fail(res, 404, "Family member not found.");
        if (!leaving && group.admin_user_id !== req.user.id) {
            return fail(res, 403, "Only the family administrator can remove linked members.");
        }
        if (!(await Family.removeLink(group.group_id, userId))) {
            return fail(res, 404, leaving ? "You are not linked to this family." : "This person is not linked to your family.");
        }
        res.status(200).json({
            success: true,
            message: leaving ? `You left ${group.group_name}.` : "The family member was removed.",
        });
    } catch (error) {
        serverError(res, "Removing family member failed", error);
    }
}

// PATCH /api/family-members/:memberId   (family administrator; multipart or JSON)
// Fields (all optional): full_name, physical_description, id_number (to verify a
// pending profile), photo (new file), id_document (new file). Always needs pin.
// Date of birth and gender can't be changed: the ID number was checked against them.
async function updateProfile(req, res) {
    // If the update does not go through, delete any files that were uploaded with it.
    res.on("finish", () => {
        if (res.statusCode !== 200) removeUploaded(req);
    });
    try {
        if (!UUID.test(req.params.memberId)) return fail(res, 404, "Profile not found.");
        const profile = await Family.findProfileForEdit(req.params.memberId);
        if (!profile) return fail(res, 404, "Profile not found.");
        if (profile.admin_user_id !== req.user.id) return fail(res, 403, "You can only edit profiles in your own family group.");

        const body = req.body || {};
        const changes = {};
        if (body.full_name !== undefined) {
            const name = String(body.full_name).trim();
            if (!NAME.test(name)) return fail(res, 400, "Enter the person's full name.");
            if (name !== profile.full_name) changes.full_name = name;
        }
        if (body.physical_description !== undefined) {
            const description = String(body.physical_description).trim();
            if (description.length < 5 || description.length > 1000) {
                return fail(res, 400, "Describe the person in 5 to 1000 characters (height, build, hair, marks).");
            }
            changes.physical_description = description;
        }
        const photo = req.files?.photo?.[0];
        const idDocument = req.files?.id_document?.[0];
        if (photo) changes.photo_url = storedPath(photo);
        if (idDocument) changes.id_document_url = storedPath(idDocument);

        const idNumber = String(body.id_number || "").replace(/\s/g, "");
        if (idNumber) {
            const check = validateIdNumber(idNumber, profile.date_of_birth, profile.gender);
            if (!check.valid) return fail(res, 400, check.reason);
            changes.verification_status = "verified"; // the ID number itself is not stored (NFR24)
        }
        if (!Object.keys(changes).length) return fail(res, 400, "There are no changes to save.");

        if (!(await requirePin(req, res, body.pin))) return;

        const updated = await Family.updateProfile(profile.member_id, changes);
        // Old files that were replaced: delete them, unless an alert still shows that photo.
        const oldFiles = [];
        if (photo && profile.photo_url && !(await Family.photoUsedByAlert(profile.photo_url))) oldFiles.push(profile.photo_url);
        if (idDocument && profile.id_document_url) oldFiles.push(profile.id_document_url);
        deleteStoredFiles(oldFiles);

        res.status(200).json({ success: true, message: "Profile updated.", profile: toProfile(updated) });
    } catch (error) {
        serverError(res, "Updating profile failed", error);
    }
}

// DELETE /api/family-members/:memberId   { pin }   (family administrator)
// Removes the profile with its photo and ID document. Not allowed while the
// person is in an open alert (mark them as found first).
async function removeProfile(req, res) {
    try {
        if (!UUID.test(req.params.memberId)) return fail(res, 404, "Profile not found.");
        const profile = await Family.findProfileForRemoval(req.params.memberId);
        if (!profile) return fail(res, 404, "Profile not found.");
        if (profile.admin_user_id !== req.user.id) return fail(res, 403, "You can only remove profiles from your own family group.");
        if (profile.in_open_alert) {
            return fail(res, 409, `${profile.full_name} is in an open alert. Mark them as found before removing the profile.`);
        }
        if (!(await requirePin(req, res, req.body?.pin))) return;
        await Family.deleteProfile(profile);
        deleteStoredFiles([profile.photo_url, profile.id_document_url]);
        res.status(200).json({ success: true, message: `${profile.full_name}'s profile was removed.` });
    } catch (error) {
        serverError(res, "Removing profile failed", error);
    }
}

// DELETE /api/family-groups/:groupId/links/:userId   (family administrator removes a linked member)
// DELETE /api/family-groups/:groupId/links/me        (a linked member leaves the family)
async function removeLinkedMember(req, res) {
    try {
        const { groupId } = req.params;
        if (!UUID.test(groupId)) return fail(res, 404, "Family group not found.");
        const leaving = !req.params.userId || req.params.userId === "me"; // /links/me has no :userId
        const userId = leaving ? req.user.id : req.params.userId;
        if (!UUID.test(userId)) return fail(res, 404, "Member not found.");

        if (!leaving) {
            const group = await Family.findGroupByAdmin(req.user.id);
            if (!group || group.group_id !== groupId) {
                return fail(res, 403, "You can only remove members from your own family group.");
            }
        }
        const removed = await Family.removeLink(groupId, userId);
        if (!removed) return fail(res, 404, leaving ? "You are not linked to this family group." : "This person is not linked to your family group.");
        res.status(200).json({
            success: true,
            message: leaving ? "You left the family group." : "The family member was removed.",
        });
    } catch (error) {
        serverError(res, "Removing linked member failed", error);
    }
}

module.exports = { updateProfile, removeProfile, removeLinkedMember, getMyGroup, createGroup, addProfile, getPhoto, getIdDocument, getLinkedGroups, removeProfile, removeLinkedMember };
