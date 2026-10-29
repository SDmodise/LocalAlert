const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { sightingUpload } = require("../middleware/uploadMiddleware");
const alerts = require("../controllers/alertController");

const ADMIN = "Family Administrator";
const router = express.Router();

router.get("/", requireAuth, alerts.list);
router.post("/", requireAuth, requireRole(ADMIN), alerts.create);
router.get("/:alertId", requireAuth, alerts.get);
router.get("/:alertId/photo", requireAuth, alerts.photo);
router.post("/:alertId/resolve", requireAuth, requireRole(ADMIN), alerts.resolve);
router.post("/:alertId/sightings", requireAuth, sightingUpload, alerts.addSighting);
router.get("/:alertId/sightings", requireAuth, alerts.listSightings);
router.get("/:alertId/sightings/:reportId/photo", requireAuth, alerts.sightingPhoto);

module.exports = router;
