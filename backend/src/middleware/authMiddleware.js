/*
Checks the JWT on protected routes and puts { id, role } on req.user.
*/
const jwt = require("jsonwebtoken");
const jwtConfig = require("../config/jwt");

function requireAuth(req, res, next) {
    const [scheme, token] = (req.headers.authorization || "").split(" ");

    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ success: false, message: "Please log in to continue." });
    }

    try {
        const payload = jwt.verify(token, jwtConfig.secret);
        req.user = { id: payload.sub, role: payload.role };
        next();
    } catch {
        return res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    }
}

module.exports = { requireAuth };
