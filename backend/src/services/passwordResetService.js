/*
Forgot password (screen 01a).

1. POST /api/auth/forgot-password { email }
   If the email belongs to an account, a 6-digit code is emailed to it. The reply is
   the same either way, so the form cannot be used to find out who has an account.
2. POST /api/auth/reset-password { email, code, new_password }
   Checks the code and sets the new password. Every existing login is signed out.

Codes expire after 15 minutes and allow 5 wrong tries. A new code can be asked for
once a minute, at most 5 times an hour. Only a bcrypt hash of each code is stored.
*/
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const emailService = require("./emailService");
const { AuthError, passwordProblem } = require("./authService");
const { normaliseEmail } = require("../utils/validator");

const CODE_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;

const SENT_MESSAGE =
    `If an account uses this email, we have sent it a 6-digit code. The code works for ${CODE_MINUTES} minutes.`;
const EXPIRED_MESSAGE = "This code has expired or has already been used. Ask for a new code.";

function newCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

async function requestReset({ email } = {}) {
    const address = normaliseEmail(email);
    if (!address) throw new AuthError("Enter a valid email address.", 400);

    const user = await User.findUserWithRoleByEmail(address);
    if (!user) {
        // Do similar work so the reply takes about as long as for a real account.
        await bcrypt.hash(newCode(), 10);
        return { message: SENT_MESSAGE, resend_after: RESEND_AFTER_SECONDS };
    }

    const recent = await PasswordReset.recentActivity(user.user_id);
    const tooSoon = recent.seconds_since_last !== null && recent.seconds_since_last < RESEND_AFTER_SECONDS;
    if (tooSoon || recent.sent_last_hour >= MAX_CODES_PER_HOUR) {
        // The earlier code still works; no new email is sent.
        return { message: SENT_MESSAGE, resend_after: RESEND_AFTER_SECONDS };
    }

    const code = newCode();
    await PasswordReset.create(user.user_id, await bcrypt.hash(code, 10), CODE_MINUTES);

    if (emailService.isConfigured()) {
        // Not awaited: sending takes a few seconds, and waiting would reveal that the account exists.
        emailService.sendPasswordResetCode({ to: user.email, firstName: user.first_name, code, minutes: CODE_MINUTES });
    } else {
        // Development only: without SMTP settings the code is shown in the backend window.
        console.log(`[password reset] SMTP is not set up, so here is the code for ${user.email}: ${code}`);
    }
    return { message: SENT_MESSAGE, resend_after: RESEND_AFTER_SECONDS };
}

async function resetPassword({ email, code, new_password: newPassword } = {}) {
    const address = normaliseEmail(email);
    if (!address) throw new AuthError("Enter a valid email address.", 400);
    const typed = String(code || "").replace(/\s/g, "");
    if (!/^[0-9]{6}$/.test(typed)) throw new AuthError("Enter the 6-digit code from the email.", 400);
    const problem = passwordProblem(newPassword);
    if (problem) throw new AuthError(problem, 400);

    const user = await User.findUserWithRoleByEmail(address);
    const active = user ? await PasswordReset.findActive(user.user_id) : null;
    if (!active) throw new AuthError(EXPIRED_MESSAGE, 400);
    if (active.attempts >= MAX_ATTEMPTS) {
        throw new AuthError("Too many wrong codes. Ask for a new code.", 429);
    }

    if (!(await bcrypt.compare(typed, active.code_hash))) {
        const attempts = await PasswordReset.addFailedAttempt(active.reset_id);
        const left = MAX_ATTEMPTS - attempts;
        throw new AuthError(
            left > 0
                ? `That code is not right. You have ${left} ${left === 1 ? "try" : "tries"} left.`
                : "Too many wrong codes. Ask for a new code.",
            left > 0 ? 400 : 429
        );
    }

    const done = await PasswordReset.completeReset(user.user_id, active.reset_id, await bcrypt.hash(newPassword, 10));
    if (!done) throw new AuthError(EXPIRED_MESSAGE, 400);

    if (emailService.isConfigured()) {
        emailService.sendPasswordChangedEmail({ to: user.email, firstName: user.first_name });
    }
    return { message: "Your password has been changed. Log in with your new password." };
}

module.exports = { requestReset, resetPassword, CODE_MINUTES, MAX_ATTEMPTS };
