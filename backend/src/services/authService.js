/*
Authentication logic: checking credentials and issuing JWT tokens.
*/
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const jwtConfig = require("../config/jwt");
const spatialService = require("./spatialService");
const { EMAIL_PATTERN, normalisePhone } = require("../utils/validator");

// Used when the email does not exist, so a failed login takes the same
// time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

class AuthError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

function issueToken(user) {
    return jwt.sign(
        { sub: user.user_id, role: user.role_name },
        jwtConfig.secret,
        { expiresIn: jwtConfig.expiresIn }
    );
}

async function login({ email, password } = {}) {
    if (!email || !password) {
        throw new AuthError("Email and password are required.", 400);
    }

    const user = await User.findUserWithRoleByEmail(email.trim().toLowerCase());
    const passwordMatches = await bcrypt.compare(
        password,
        user ? user.password_hash : DUMMY_HASH
    );

    // Same message for an unknown email and a wrong password.
    if (!user || !passwordMatches) {
        throw new AuthError("Incorrect email or password.", 401);
    }

    return {
        token: issueToken(user),
        user: {
            user_id: user.user_id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            role: user.role_name,
        },
    };
}

const ROLES = ["Family Administrator", "Community Member"];
const NAME_PATTERN = /^[A-Za-zÀ-ÿ' -]{1,50}$/;

function passwordProblem(password) {
    if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters.";
    if (password.length > 72) return "Password must be 72 characters or fewer.";
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain a letter and a number.";
    return null;
}

async function register(body = {}) {
    const firstName = String(body.first_name || "").trim();
    const lastName = String(body.last_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = normalisePhone(body.phone_number);
    const role = body.role;

    if (!NAME_PATTERN.test(firstName) || !NAME_PATTERN.test(lastName)) {
        throw new AuthError("Enter a valid first and last name.", 400);
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 100) {
        throw new AuthError("Enter a valid email address.", 400);
    }
    if (!phone) {
        throw new AuthError("Enter a valid South African mobile number.", 400);
    }
    const problem = passwordProblem(body.password);
    if (problem) throw new AuthError(problem, 400);
    if (!ROLES.includes(role)) {
        throw new AuthError("Choose Family Administrator or Community Member.", 400);
    }
    if (body.privacy_consent !== true) {
        throw new AuthError("You must accept the privacy notice to create an account.", 400);
    }

    let pinHash = null;
    if (role === "Family Administrator") {
        if (!/^[0-9]{4}$/.test(String(body.pin || ""))) {
            throw new AuthError("Your PIN must be exactly 4 digits.", 400);
        }
        pinHash = await bcrypt.hash(String(body.pin), 10);
    }

    if (await User.findUserWithRoleByEmail(email)) {
        throw new AuthError("An account with this email already exists.", 409);
    }

    const roleRow = await User.getRoleId(role);
    if (!roleRow) throw new Error(`Role "${role}" is missing from the roles table.`);

    // The coordinates are only used to find the municipality; they are not stored.
    const municipality = body.latitude != null && body.longitude != null
        ? await spatialService.findMunicipality(body.latitude, body.longitude)
        : null;

    let created;
    try {
        created = await User.createUser({
            role_id: roleRow.role_id,
            first_name: firstName,
            last_name: lastName,
            email,
            password_hash: await bcrypt.hash(body.password, 10),
            phone_number: phone,
            pin_hash: pinHash,
            municipality_id: municipality ? municipality.municipality_id : null,
        });
    } catch (error) {
        if (error.code === "23505") {
            throw new AuthError("An account with this email already exists.", 409);
        }
        throw error;
    }

    const user = {
        user_id: created.user_id,
        first_name: created.first_name,
        last_name: created.last_name,
        email: created.email,
        role,
        municipality_name: municipality ? municipality.municipality_name : null,
    };

    return { token: issueToken({ user_id: user.user_id, role_name: role }), user };
}

module.exports = {
    register,
    login,
    issueToken,
    AuthError,
};
