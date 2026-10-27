const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { profileUpload } = require("../middleware/uploadMiddleware");
const family = require("../controllers/familyController");

const ADMIN = "Family Administrator";

// /api/family-groups
const groups = express.Router();
groups.get("/mine", requireAuth, requireRole(ADMIN), family.getMyGroup);
groups.post("/", requireAuth, requireRole(ADMIN), family.createGroup);
groups.post("/:groupId/profiles", requireAuth, requireRole(ADMIN), profileUpload, family.addProfile);

// /api/family-members
const members = express.Router();
members.get("/:memberId/photo", requireAuth, family.getPhoto);
members.get("/:memberId/id-document", requireAuth, requireRole(ADMIN), family.getIdDocument);

module.exports = { groups, members };
