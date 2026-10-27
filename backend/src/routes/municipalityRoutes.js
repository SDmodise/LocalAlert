const express = require("express");
const router = express.Router();
const municipalityController = require("../controllers/municipalityController");

router.get("/lookup", municipalityController.lookup);

module.exports = router;
