/*
Checks the JWT on protected routes and puts { id, role } on req.user.
A token is also refused when the account was deleted, or when the password was
reset after the token was issued (its token version no longer matches).
*/
const jwt = require("jsonwebtoken");
const jwtConfig = require("../config/jwt");
const User = require("../models/User");

const EXPIRED = { success: false, message: "Your session has expired. Please log in again." };

async function verify(token, req, res, next) {
    let payload;
    try {
        payload = jwt.verify(token, jwtConfig.secret);
    } catch {
        return res.status(401).json(EXPIRED);
    }
    try {
        const version = await User.findTokenVersion(payload.sub);
        if (version === null || version !== (payload.tv || 0)) return res.status(401).json(EXPIRED);
    } catch (error) {
        console.error("Session check failed:", error.message);
        return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
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
