/*
Shared input checks.
*/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts 0821234567, 082 123 4567 or +27821234567 and returns 0821234567 (or null).
function normalisePhone(phone) {
    const digits = String(phone || "").replace(/[\s-]/g, "");
    const local = digits.startsWith("+27") ? "0" + digits.slice(3) : digits;
    return /^0[6-8][0-9]{8}$/.test(local) ? local : null;
}

function normaliseEmail(email) {
    const value = String(email || "").trim().toLowerCase();
    return EMAIL_PATTERN.test(value) && value.length <= 100 ? value : null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = { EMAIL_PATTERN, normalisePhone, normaliseEmail, UUID_PATTERN };
