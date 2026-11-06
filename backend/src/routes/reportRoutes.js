const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");
const reports = require("../controllers/reportController");
const { ADMIN } = require("../config/roles");

// /api/reports (Family Administrators only)
const router = express.Router();
router.get("/family", requireAuth, requireRole(ADMIN), reports.familyReport);
router.get("/alerts/:alertId", requireAuth, requireRole(ADMIN), reports.alertReport);

module.exports = router;
