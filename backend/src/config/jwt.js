/*
JWT settings, read from the environment (.env).
*/
require("dotenv").config();

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set in backend/.env");
}

module.exports = {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
};
