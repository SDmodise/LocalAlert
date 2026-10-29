const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const notifications = require("../controllers/notificationController");

const router = express.Router();
router.get("/", requireAuth, notifications.list);
router.get("/unread-count", requireAuth, notifications.unreadCount);
router.post("/read", requireAuth, notifications.markRead);

module.exports = router;
