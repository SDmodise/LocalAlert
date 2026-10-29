const Notification = require("../models/Notification");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serverError(res, label, error) {
    console.error(`${label}:`, error.message);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
}

// GET /api/notifications?limit=50
async function list(req, res) {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
        const [rows, unread] = await Promise.all([
            Notification.listForUser(req.user.id, limit),
            Notification.unreadCount(req.user.id),
        ]);
        res.status(200).json({ success: true, unread_count: unread, notifications: rows });
    } catch (error) {
        serverError(res, "Loading notifications failed", error);
    }
}

// GET /api/notifications/unread-count   (polled by the app for the badge)
async function unreadCount(req, res) {
    try {
        res.status(200).json({ success: true, unread_count: await Notification.unreadCount(req.user.id) });
    } catch (error) {
        serverError(res, "Counting notifications failed", error);
    }
}

// POST /api/notifications/read   { ids: [...] }  or  { all: true }  or  { alert_id }
async function markRead(req, res) {
    try {
        const body = req.body || {};
        let changed;
        if (body.alert_id) {
            if (!UUID.test(body.alert_id)) return res.status(400).json({ success: false, message: "Unknown alert." });
            changed = await Notification.markAlertRead(req.user.id, body.alert_id);
        } else if (body.all === true) {
            changed = await Notification.markRead(req.user.id, null);
        } else {
            const ids = Array.isArray(body.ids) ? body.ids.filter((id) => UUID.test(String(id))) : [];
            if (!ids.length) return res.status(400).json({ success: false, message: "Nothing to mark as read." });
            changed = await Notification.markRead(req.user.id, ids.slice(0, 200));
        }
        res.status(200).json({ success: true, marked: changed, unread_count: await Notification.unreadCount(req.user.id) });
    } catch (error) {
        serverError(res, "Marking notifications failed", error);
    }
}

module.exports = { list, unreadCount, markRead };
