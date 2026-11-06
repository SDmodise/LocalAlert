const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");

router.get("/me", requireAuth, userController.getMe);
router.put("/me/location", requireAuth, userController.updateLocation);
router.put("/me/home-municipality", requireAuth, userController.updateHomeMunicipality);
router.get("/me/reportable-profiles", requireAuth, userController.reportableProfiles);
// Anyone with a PIN (family administrators, and people with shared responsibility).
router.put("/me/pin", requireAuth, userController.changePin);
router.put("/me/push-token", requireAuth, userController.savePushToken);
router.delete("/me/push-token", userController.removePushToken);
router.delete("/me", requireAuth, userController.deleteMe);

module.exports = router;
