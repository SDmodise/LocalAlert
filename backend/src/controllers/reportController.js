/*
Reports for Family Administrators (Profile > Reports in the app).

GET /api/reports/family             the family's alerts summed up, one row per alert
GET /api/reports/alerts/:alertId    one alert's report: timeline, people alerted, sightings
*/
const Family = require("../models/Family");
const Report = require("../models/Report");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function myGroup(req, res) {
    const group = await Family.findGroupByAdmin(req.user.id);
    if (!group) {
        res.status(404).json({ success: false, message: "Create your family group first. Reports are made from your family's alerts." });
        return null;
    }
    return group;
}

async function familyReport(req, res) {
    try {
        const group = await myGroup(req, res);
        if (!group) return;
        res.status(200).json({ success: true, report: await Report.familyReport(group) });
    } catch (error) {
        console.error("Family report failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

async function alertReport(req, res) {
    try {
        if (!UUID.test(req.params.alertId)) return res.status(404).json({ success: false, message: "Alert not found." });
        const group = await myGroup(req, res);
        if (!group) return;
        const report = await Report.alertReport(group.group_id, req.params.alertId);
        if (!report) return res.status(404).json({ success: false, message: "Alert not found in your family's alerts." });
        res.status(200).json({ success: true, report });
    } catch (error) {
        console.error("Alert report failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

module.exports = { familyReport, alertReport };
