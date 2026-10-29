const express = require("express");
const share = require("../controllers/shareController");

// Public pages for shared alert links: /a/<share_code>  (no login needed)
const router = express.Router();
router.get("/:code", share.publicPage);
router.get("/:code/photo", share.publicPhoto);

module.exports = router;
