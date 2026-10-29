const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { profileUpload } = require("../middleware/uploadMiddleware");
const family = require("../controllers/familyController");
const invitation = require("../controllers/invitationController");

const ADMIN = "Family Administrator";

// /api/family-groups
const groups = express.Router();
groups.get("/mine", requireAuth, requireRole(ADMIN), family.getMyGroup);
groups.post("/", requireAuth, requireRole(ADMIN), family.createGroup);
groups.post("/:groupId/profiles", requireAuth, requireRole(ADMIN), profileUpload, family.addProfile);
groups.post("/:groupId/invitations", requireAuth, requireRole(ADMIN), invitation.create);

// /api/family-members
const members = express.Router();
members.get("/:memberId/photo", requireAuth, family.getPhoto);
members.get("/:memberId/id-document", requireAuth, requireRole(ADMIN), family.getIdDocument);

module.exports = { groups, members };
