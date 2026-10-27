/*
Allows a route only for the listed roles. Use after requireAuth, for example:
router.post("/", requireAuth, requireRole("Family Administrator"), handler)
*/
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "You are not allowed to do this." });
        }
        next();
    };
}

module.exports = { requireRole };
