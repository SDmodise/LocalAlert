const express = require("express");
const { requireAuth, requireAuthForImage } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { profileUpload } = require("../middleware/uploadMiddleware");
const family = require("../controllers/familyController");
const invitation = require("../controllers/invitationController");

const { ADMIN } = require("../config/roles");

// /api/family-groups
const groups = express.Router();
groups.get("/mine", requireAuth, requireRole(ADMIN), family.getMyGroup);
groups.get("/linked", requireAuth, family.getLinkedGroups);
groups.post("/", requireAuth, requireRole(ADMIN), family.createGroup);
groups.post("/:groupId/profiles", requireAuth, requireRole(ADMIN), profileUpload, family.addProfile);
groups.post("/:groupId/invitations", requireAuth, requireRole(ADMIN), invitation.create);
groups.delete("/:groupId/links/me", requireAuth, family.removeLinkedMember);                            // a linked member leaves
groups.delete("/:groupId/links/:userId", requireAuth, requireRole(ADMIN), family.removeLinkedMember);   // the administrator removes someone

// /api/family-members
const members = express.Router();
members.get("/:memberId/photo", requireAuthForImage, family.getPhoto);
members.get("/:memberId/id-document", requireAuthForImage, requireRole(ADMIN), family.getIdDocument);
members.patch("/:memberId", requireAuth, requireRole(ADMIN), profileUpload, family.updateProfile);     // edit (PIN)
members.delete("/:memberId", requireAuth, requireRole(ADMIN), family.removeProfile);                   // remove (PIN)

module.exports = { groups, members };
