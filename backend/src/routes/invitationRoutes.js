const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const invitation = require("../controllers/invitationController");

// /api/invitations — any signed-in user (the person being linked)
const router = express.Router();
router.get("/mine", requireAuth, invitation.mine);
router.get("/preview", requireAuth, invitation.preview);
router.post("/accept", requireAuth, invitation.accept);
router.post("/:invitationId/decline", requireAuth, invitation.decline);

module.exports = router;
