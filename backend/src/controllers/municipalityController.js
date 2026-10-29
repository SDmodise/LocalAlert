const spatialService = require("../services/spatialService");

// GET /api/municipalities/lookup?lat=..&lng=..
// The coordinates are only used for this lookup and are not stored.
async function lookup(req, res) {
    try {
        const latitude = Number(req.query.lat);
        const longitude = Number(req.query.lng);

        if (!spatialService.isValidCoordinate(latitude, longitude)) {
            return res.status(400).json({ success: false, message: "A valid location is required." });
        }

        const municipality = await spatialService.findMunicipality(latitude, longitude);
        if (!municipality) {
            return res.status(404).json({
                success: false,
                message: "Your area is not covered by LocalAlert yet.",
            });
        }

        res.status(200).json({ success: true, municipality });
    } catch (error) {
        console.error("Municipality lookup failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

// GET /api/municipalities
// The list of covered municipalities, so people can choose theirs by hand
// when their location can't be found. Public: used during sign-up.
async function list(req, res) {
    try {
        const municipalities = await spatialService.listMunicipalities();
        res.set("Cache-Control", "public, max-age=300");
        res.status(200).json({ success: true, municipalities });
    } catch (error) {
        console.error("Listing municipalities failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

module.exports = { lookup, list };
