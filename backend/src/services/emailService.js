/*
Sends email through an SMTP account set in backend/.env:

  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=465
  SMTP_USER=your.address@gmail.com
  SMTP_PASS=your-16-letter-app-password
  MAIL_FROM="LocalAlert <your.address@gmail.com>"

If these are not set, nothing is emailed: invitations still appear in the app, and
password reset codes are printed in the backend window instead (development only).
*/
const nodemailer = require("nodemailer");

let transporter = null;

function isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
    if (!transporter) {
        const port = Number(process.env.SMTP_PORT) || 465;
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465, // 465 = TLS from the start; 587 = STARTTLS
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
        });
    }
    return transporter;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Returns true when the email was handed to the mail server.
async function sendInvitationEmail({ to, inviterName, groupName, expiresAt }) {
    if (!isConfigured()) {
        console.log("[email] SMTP is not set up in .env, so the invitation was not emailed (it is still in the app).");
        return false;
    }
    const expires = new Date(expiresAt).toLocaleString("en-ZA", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
    });
    const steps = [
        "Install LocalAlert and sign up (or log in) with this email address.",
        "Open Profile › Join a family group.",
        `Tap Accept next to ${groupName}.`,
    ];
    const text =
        `${inviterName} has invited you to join the family group "${groupName}" on LocalAlert.\n\n` +
        `As a linked family member you will be told immediately if someone in this family is reported missing, wherever you are.\n\n` +
        `To accept:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n` +
        `The invitation expires on ${expires}. If you were not expecting it, you can ignore this email.`;
    const html = `
<div style="font-family:Arial,sans-serif;max-width:520px;color:#0B1A33">
  <div style="background:#1559D6;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">LocalAlert</div>
  <div style="border:1.5px solid #D6E2F5;border-top:0;padding:22px;border-radius:0 0 12px 12px">
    <p style="font-size:16px;margin-top:0"><b>${escapeHtml(inviterName)}</b> has invited you to join the family group <b>${escapeHtml(groupName)}</b>.</p>
    <p style="color:#4A5B78">As a linked family member you will be told immediately if someone in this family is reported missing, wherever you are.</p>
    <p style="margin-bottom:6px"><b>To accept:</b></p>
    <ol style="color:#4A5B78;padding-left:20px;margin-top:0">${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
    <p style="color:#8292AD;font-size:13px">The invitation expires on ${escapeHtml(expires)}. If you were not expecting it, you can ignore this email.</p>
  </div>
</div>`;

    try {
        await getTransporter().sendMail({
            from: process.env.MAIL_FROM || process.env.SMTP_USER,
            to,
            subject: `${inviterName} invited you to ${groupName} on LocalAlert`,
            text,
            html,
        });
        return true;
    } catch (error) {
        // Never log the password; the error message is enough to fix the setup.
        console.error("[email] sending the invitation failed:", error.message);
        return false;
    }
}

// Shared layout for LocalAlert emails: a blue header and a bordered body.
function layout(bodyHtml) {
    return `
<div style="font-family:Arial,sans-serif;max-width:520px;color:#0B1A33">
  <div style="background:#1559D6;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">LocalAlert</div>
  <div style="border:1.5px solid #D6E2F5;border-top:0;padding:22px;border-radius:0 0 12px 12px">${bodyHtml}</div>
</div>`;
}

async function send({ to, subject, text, html }, what) {
    try {
        await getTransporter().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
        return true;
    } catch (error) {
        console.error(`[email] sending the ${what} failed:`, error.message);
        return false;
    }
}

async function sendPasswordResetCode({ to, firstName, code, minutes }) {
    if (!isConfigured()) return false;
    const text =
        `Hi ${firstName},\n\nYour LocalAlert password reset code is: ${code}\n\n` +
        `Type it in the app to choose a new password. The code works for ${minutes} minutes and can only be used once.\n\n` +
        `If you did not ask to reset your password, you can ignore this email. Your password stays the same.`;
    const html = layout(`
    <p style="font-size:16px;margin-top:0">Hi ${escapeHtml(firstName)},</p>
    <p style="color:#4A5B78">Use this code in the LocalAlert app to choose a new password:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1559D6;background:#EEF4FF;border-radius:10px;padding:14px;text-align:center;margin:18px 0">${escapeHtml(code)}</p>
    <p style="color:#4A5B78">The code works for ${minutes} minutes and can only be used once.</p>
    <p style="color:#8292AD;font-size:13px">If you did not ask to reset your password, you can ignore this email. Your password stays the same.</p>`);
    return send({ to, subject: `${code} is your LocalAlert reset code`, text, html }, "password reset code");
}

async function sendPasswordChangedEmail({ to, firstName }) {
    if (!isConfigured()) return false;
    const text =
        `Hi ${firstName},\n\nThe password for your LocalAlert account was just changed, and you have been logged out on your other devices.\n\n` +
        `If this was not you, reset your password straight away from the LocalAlert login screen (Forgot password?).`;
    const html = layout(`
    <p style="font-size:16px;margin-top:0">Hi ${escapeHtml(firstName)},</p>
    <p style="color:#4A5B78">The password for your LocalAlert account was just changed, and you have been logged out on your other devices.</p>
    <p style="color:#4A5B78"><b>If this was not you</b>, reset your password straight away from the LocalAlert login screen (Forgot password?).</p>`);
    return send({ to, subject: "Your LocalAlert password was changed", text, html }, "password changed notice");
}

module.exports = { isConfigured, sendInvitationEmail, sendPasswordResetCode, sendPasswordChangedEmail };
