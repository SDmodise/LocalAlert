const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const { ADMIN } = require("../config/roles");
const userController = require("../controllers/userController");

router.get("/me", requireAuth, userController.getMe);
router.put("/me/location", requireAuth, userController.updateLocation);
router.put("/me/pin", requireAuth, requireRole(ADMIN), userController.changePin);
router.put("/me/push-token", requireAuth, userController.savePushToken);
router.delete("/me/push-token", userController.removePushToken);
router.delete("/me", requireAuth, userController.deleteMe);

module.exports = router;
