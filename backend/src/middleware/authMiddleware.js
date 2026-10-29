/*
Checks the JWT on protected routes and puts { id, role } on req.user.
*/
const jwt = require("jsonwebtoken");
const jwtConfig = require("../config/jwt");

function verify(token, req, res, next) {
    try {
        const payload = jwt.verify(token, jwtConfig.secret);
        req.user = { id: payload.sub, role: payload.role };
        next();
    } catch {
        return res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    }
}

function requireAuth(req, res, next) {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ success: false, message: "Please log in to continue." });
    }
    return verify(token, req, res, next);
}

// For protected images only (GET photo / ID document routes): also accepts the
// login token as ?access_token=..., because the phone's image component does not
// always send request headers. The same permission checks still apply.
function requireAuthForImage(req, res, next) {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme === "Bearer" && token) return verify(token, req, res, next);
    const queryToken = typeof req.query.access_token === "string" ? req.query.access_token : "";
    if (req.method === "GET" && queryToken) {
        res.set("Referrer-Policy", "no-referrer");
        return verify(queryToken, req, res, next);
    }
    return res.status(401).json({ success: false, message: "Please log in to continue." });
}

module.exports = { requireAuth, requireAuthForImage };
