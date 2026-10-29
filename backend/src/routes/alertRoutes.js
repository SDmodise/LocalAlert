const express = require("express");
const { requireAuth, requireAuthForImage } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { alertPhotoUpload, sightingUpload } = require("../middleware/uploadMiddleware");
const alerts = require("../controllers/alertController");
const share = require("../controllers/shareController");

const ADMIN = "Family Administrator";
const router = express.Router();

router.get("/", requireAuth, alerts.list);
router.post("/", requireAuth, requireRole(ADMIN), alertPhotoUpload, alerts.create);
router.post("/shared/:code/follow", requireAuth, share.followShared);
router.get("/:alertId", requireAuth, alerts.get);
router.get("/:alertId/photo", requireAuthForImage, alerts.photo);
router.post("/:alertId/share", requireAuth, share.createShareLink);
router.post("/:alertId/resolve", requireAuth, requireRole(ADMIN), alerts.resolve);
router.post("/:alertId/sightings", requireAuth, sightingUpload, alerts.addSighting);
router.get("/:alertId/sightings", requireAuth, alerts.listSightings);
router.get("/:alertId/sightings/:reportId/photo", requireAuthForImage, alerts.sightingPhoto);

module.exports = router;
