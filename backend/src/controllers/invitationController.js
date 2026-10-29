/*
Linking users to a family group by QR code or in-app invitation (FR31, FR32).
Tokens are single-use, expire after 24 hours and only their hash is stored.
*/
const crypto = require("crypto");
const Invitation = require("../models/Invitation");
const Family = require("../models/Family");
const User = require("../models/User");
const { sendInvitationEmail } = require("../services/emailService");
const { normaliseEmail, normalisePhone, UUID_PATTERN } = require("../utils/validator");

const LIFETIME_MS = 24 * 60 * 60 * 1000;
const QR_PREFIX = "localalert:join:";

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function serverError(res, label, error) {
    console.error(`${label}:`, error.message);
    return fail(res, 500, "Something went wrong. Please try again.");
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function summary(inv) {
    return {
        invitation_id: inv.invitation_id,
        group_id: inv.group_id,
        group_name: inv.group_name,
        invited_by: `${inv.admin_first_name} ${inv.admin_last_name}`,
        method: inv.method,
        expires_at: inv.expires_at,
    };
}

// Returns [status, message] when the user cannot use this invitation, otherwise null.
async function problemWith(inv, userId) {
    if (!inv) return [404, "This code or invitation is not valid."];
    if (inv.status === "accepted") return [410, "This code has already been used. Ask for a new one."];
    if (inv.status !== "pending") return [410, "This code is no longer valid. Ask for a new one."];
    if (new Date(inv.expires_at).getTime() <= Date.now()) {
        await Invitation.markExpired(inv.invitation_id);
        return [410, "This code has expired. Ask for a new one."];
    }
    if (inv.admin_user_id === userId) return [400, "This is your own family group."];
    if (await Invitation.isLinked(inv.group_id, userId)) return [409, "You are already linked to this family group."];
    return null;
}

function addressedTo(inv, profile) {
    return (inv.invite_email && inv.invite_email.toLowerCase() === profile.email.toLowerCase()) ||
           (inv.invite_phone && inv.invite_phone === profile.phone_number);
}

// POST /api/family-groups/:groupId/invitations  { method: "qr" }  or  { method: "invite", contact }
async function create(req, res) {
    try {
        const group = await Family.findGroupByAdmin(req.user.id);
        if (!group || group.group_id !== req.params.groupId) {
            return fail(res, 403, "You can only invite people to your own family group.");
        }

        const method = req.body?.method;
        if (method !== "qr" && method !== "invite") return fail(res, 400, "Choose QR code or invitation.");

        let inviteEmail = null;
        let invitePhone = null;
        let me = null;
        if (method === "invite") {
            const contact = String(req.body.contact || "").trim();
            if (contact.includes("@")) inviteEmail = normaliseEmail(contact);
            else invitePhone = normalisePhone(contact);
            if (!inviteEmail && !invitePhone) {
                return fail(res, 400, "Enter a valid email address or South African mobile number.");
            }
            me = await User.findProfileById(req.user.id);
            if (inviteEmail === me.email.toLowerCase() || invitePhone === me.phone_number) {
                return fail(res, 400, "You cannot invite yourself.");
            }
        } else {
            await Invitation.revokePendingQr(group.group_id);
        }

        const token = crypto.randomBytes(32).toString("base64url");
        const invitation = await Invitation.create({
            group_id: group.group_id,
            invited_by: req.user.id,
            token_hash: hashToken(token),
            method,
            invite_email: inviteEmail,
            invite_phone: invitePhone,
            expires_at: new Date(Date.now() + LIFETIME_MS),
        });

        if (method === "qr") {
            // The token is only returned once, inside the QR code value.
            return res.status(201).json({
                success: true,
                invitation: { invitation_id: invitation.invitation_id, expires_at: invitation.expires_at },
                qr_value: QR_PREFIX + token,
            });
        }

        // Email invitations are also emailed. The reply is the same whether or not
        // someone already uses this email or number.
        let emailed = false;
        if (inviteEmail) {
            emailed = await sendInvitationEmail({
                to: inviteEmail,
                inviterName: `${me.first_name} ${me.last_name}`.trim(),
                groupName: group.group_name,
                expiresAt: invitation.expires_at,
            });
        }
        const inApp = "They will see it in LocalAlert under Profile › Join a family group.";
        res.status(201).json({
            success: true,
            emailed,
            message: emailed
                ? `Invitation emailed to ${inviteEmail}. ${inApp}`
                : inviteEmail
                    ? `Invitation saved, but the email could not be sent. ${inApp}`
                    : `Invitation sent. ${inApp}`,
            invitation: { invitation_id: invitation.invitation_id, expires_at: invitation.expires_at },
        });
    } catch (error) {
        serverError(res, "Creating invitation failed", error);
    }
}

function tokenFrom(value) {
    const text = String(value || "").trim();
    return text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length) : text;
}

// GET /api/invitations/preview?code=localalert:join:...   (shown before accepting a scanned QR code)
async function preview(req, res) {
    try {
        const token = tokenFrom(req.query.code);
        if (!token) return fail(res, 400, "Scan a LocalAlert family QR code.");
        const inv = await Invitation.findByTokenHash(hashToken(token));
        const problem = await problemWith(inv, req.user.id);
        if (problem) return fail(res, ...problem);
        res.status(200).json({ success: true, invitation: summary(inv) });
    } catch (error) {
        serverError(res, "Previewing invitation failed", error);
    }
}

// GET /api/invitations/mine
async function mine(req, res) {
    try {
        const me = await User.findProfileById(req.user.id);
        const rows = await Invitation.listForUser(me.email.toLowerCase(), me.phone_number, req.user.id);
        res.status(200).json({ success: true, invitations: rows.map(summary) });
    } catch (error) {
        serverError(res, "Loading invitations failed", error);
    }
}

// POST /api/invitations/accept  { code }  (scanned QR)  or  { invitation_id }  (in-app invitation)
async function accept(req, res) {
    try {
        let inv;
        if (req.body?.code) {
            inv = await Invitation.findByTokenHash(hashToken(tokenFrom(req.body.code)));
        } else if (UUID_PATTERN.test(req.body?.invitation_id || "")) {
            inv = await Invitation.findById(req.body.invitation_id);
            if (inv && inv.method === "invite") {
                const me = await User.findProfileById(req.user.id);
                if (!addressedTo(inv, me)) return fail(res, 403, "This invitation is for another user.");
            } else if (inv) {
                // A QR invitation can only be accepted with the code itself.
                return fail(res, 403, "Scan the QR code to join this family group.");
            }
        } else {
            return fail(res, 400, "Scan a QR code or choose an invitation.");
        }

        const problem = await problemWith(inv, req.user.id);
        if (problem) return fail(res, ...problem);

        const ok = await Invitation.accept(inv.invitation_id, inv.group_id, req.user.id);
        if (!ok) return fail(res, 410, "This code has already been used. Ask for a new one.");

        res.status(200).json({
            success: true,
            message: `You joined ${inv.group_name}.`,
            group: { group_id: inv.group_id, group_name: inv.group_name },
        });
    } catch (error) {
        serverError(res, "Accepting invitation failed", error);
    }
}

// POST /api/invitations/:invitationId/decline
async function decline(req, res) {
    try {
        if (!UUID_PATTERN.test(req.params.invitationId)) return fail(res, 404, "Invitation not found.");
        const inv = await Invitation.findById(req.params.invitationId);
        const me = await User.findProfileById(req.user.id);
        if (!inv || inv.method !== "invite" || !addressedTo(inv, me)) return fail(res, 404, "Invitation not found.");
        await Invitation.decline(inv.invitation_id);
        res.status(200).json({ success: true, message: "Invitation declined." });
    } catch (error) {
        serverError(res, "Declining invitation failed", error);
    }
}

module.exports = { create, preview, mine, accept, decline, QR_PREFIX };
