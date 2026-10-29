/*
Sharing alerts outside the app (WhatsApp, Facebook, X, Instagram, SMS, ...).

The app shares a link, never a copy of the details:  https://<server>/a/<share_code>
The page reads the alert live from the database each time it is opened, so people
always see the current status. Once the person is found, the page says so and the
photo is no longer shown. Exact coordinates, date of birth and documents are never shown.

Open Graph tags give a preview card (title, text and photo) in WhatsApp, Facebook and X.
*/
const Alert = require("../models/Alert");
const { absolutePath } = require("../middleware/uploadMiddleware");

const CODE = /^[A-Za-z0-9_-]{6,16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function baseUrl(req) {
    const configured = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
    // Tunnels and hosting proxies pass the public host name in X-Forwarded-Host.
    const host = (req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
    return configured || `${req.protocol}://${host}`;
}

function shareUrl(req, code) {
    return `${baseUrl(req)}/a/${code}`;
}

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sast(date) {
    if (!date) return "";
    return new Date(date).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg", weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

function personWord(a) {
    const child = a.age !== null && a.age < 18;
    return a.gender === "Female" ? (child ? "girl" : "woman") : (child ? "boy" : "man");
}

function shareText(a, url) {
    const age = a.age !== null ? `, ${a.age}` : "";
    // The link goes on its own line so messaging apps reliably turn it into a tappable link.
    return `MISSING: ${a.child_name}${age}\n` +
        `Please help find them and share. See the photo and the latest details on LocalAlert (always up to date):\n` +
        `${url}`;
}

// True for addresses only reachable on the same network (Wi-Fi testing):
// those links cannot be opened by other people and are not shown as links in most apps.
function isLocalOnly(url) {
    try {
        const host = new URL(url).hostname;
        return host === "localhost" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    } catch {
        return true;
    }
}

// ---- in the app -----------------------------------------------------------

// POST /api/alerts/:alertId/share  (anyone who can see the alert)
async function createShareLink(req, res) {
    try {
        if (!UUID.test(req.params.alertId)) return res.status(404).json({ success: false, message: "Alert not found." });
        const row = await Alert.findForUser(req.params.alertId, req.user.id);
        if (!row) return res.status(404).json({ success: false, message: "Alert not found." });
        if (!row.is_creator && !row.is_family && !row.is_recipient) {
            return res.status(403).json({ success: false, message: "You have not received this alert." });
        }
        if (row.status === "resolved") {
            return res.status(409).json({ success: false, message: `${row.child_name} has been found, so this alert is no longer shared.` });
        }
        const code = await Alert.getOrCreateShareCode(row.alert_id);
        const url = shareUrl(req, code);
        const localOnly = isLocalOnly(url);
        if (localOnly) {
            console.log("[share] Share links use a local address. Set PUBLIC_BASE_URL in .env to a public https address (e.g. a Cloudflare tunnel) so other people can open them.");
        }
        res.status(200).json({ success: true, url, code, message: shareText(row, url), local_only: localOnly });
    } catch (error) {
        console.error("Creating share link failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

// POST /api/alerts/shared/:code/follow  (signed-in user opened a shared link in the app)
async function followShared(req, res) {
    try {
        if (!CODE.test(req.params.code)) return res.status(404).json({ success: false, message: "This alert link is not valid." });
        const alert = await Alert.findByShareCode(req.params.code);
        if (!alert) return res.status(404).json({ success: false, message: "This alert link is not valid." });
        await Alert.followShared(alert.alert_id, req.user.id);
        res.status(200).json({
            success: true,
            alert_id: alert.alert_id,
            status: alert.status,
            child_name: alert.child_name,
        });
    } catch (error) {
        console.error("Opening shared alert failed:", error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
}

// ---- public web page ------------------------------------------------------

const LOGO = `<svg width="30" height="28" viewBox="150 160 724 670" aria-hidden="true"><g stroke="#fff" stroke-width="44" stroke-linecap="round" fill="none"><path d="M769.3 243.1 A318 318 0 0 1 769.3 616.9"/><path d="M254.7 616.9 A318 318 0 0 1 254.7 243.1"/><path d="M842.1 190.2 A408 408 0 0 1 842.1 669.8" opacity=".55"/><path d="M181.9 669.8 A408 408 0 0 1 181.9 190.2" opacity=".55"/></g><path d="M512 820 C436.4 644.5 302 593.8 302 430 A210 210 0 1 1 722 430 C722 593.8 587.6 644.5 512 820 Z" fill="#fff"/><circle cx="512" cy="399.8" r="51.5" fill="#1559D6"/><path d="M409.0 545.4 C409.0 471.4 456.0 467.0 512 467.0 C568.0 467.0 615.0 471.4 615.0 545.4 Z" fill="#1559D6"/></svg>`;

function page({ title, description, image, url, body }) {
    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:site_name" content="LocalAlert">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${image ? `<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="robots" content="noindex">
<style>
:root{--blue:#1559D6;--dark:#0B2F73;--light:#E8F0FD;--tint:#F4F8FE;--line:#D6E2F5;--ink:#0B1A33;--ink2:#4A5B78;--ink3:#8292AD}
*{box-sizing:border-box}body{margin:0;background:var(--tint);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink)}
header{background:var(--blue);color:#fff;padding:14px 18px;display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px}
main{max-width:520px;margin:0 auto;padding:16px}
.card{background:#fff;border:1.5px solid var(--line);border-radius:18px;overflow:hidden}
.photo{width:100%;max-height:420px;object-fit:cover;display:block;background:var(--light)}
.content{padding:18px;display:grid;gap:12px}
.chip{display:inline-block;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800;letter-spacing:.04em;color:#fff;background:var(--blue)}
.chip.dark{background:var(--dark)}.chip.found{background:var(--light);color:var(--blue)}
h1{margin:0;font-size:26px}.sub{color:var(--ink2);margin-top:-6px}
.row{background:var(--tint);border:1.5px solid var(--line);border-radius:12px;padding:12px}
.label{font-size:12px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.04em}
.value{font-size:16px;margin-top:2px;line-height:1.4}
.btn{display:block;text-align:center;text-decoration:none;font-weight:700;border-radius:14px;padding:14px;font-size:16px}
.primary{background:var(--blue);color:#fff}.outline{border:1.5px solid var(--blue);color:var(--blue);background:#fff}
.note{font-size:13px;color:var(--ink3);text-align:center;line-height:1.5}
</style></head>
<body><header>${LOGO}<span>LocalAlert</span></header><main>${body}</main></body></html>`;
}

function notFoundPage(res, url) {
    res.status(404).set("Cache-Control", "no-store").send(page({
        title: "Alert not found · LocalAlert",
        description: "This LocalAlert link is not valid.",
        url,
        body: `<div class="card"><div class="content"><h1>Alert not found</h1>
<p class="sub">This link is not valid. If someone is in danger, call SAPS on 10111.</p>
<a class="btn outline" href="tel:10111">Call SAPS (10111)</a></div></div>`,
    }));
}

// GET /a/:code
async function publicPage(req, res) {
    const url = `${baseUrl(req)}/a/${encodeURIComponent(req.params.code)}`;
    try {
        if (!CODE.test(req.params.code)) return notFoundPage(res, url);
        const a = await Alert.findByShareCode(req.params.code);
        if (!a) return notFoundPage(res, url);

        // Always fresh: never let browsers or apps keep an old copy.
        res.set("Cache-Control", "no-cache, max-age=0");
        const openInApp = `localalert://a/${encodeURIComponent(req.params.code)}`;
        const age = a.age !== null ? `${a.age} years · ` : "";
        const where = a.last_seen_place || a.municipality_name || "Unknown";
        const area = [a.municipality_name, a.province].filter(Boolean).join(", ");

        if (a.status === "resolved") {
            return res.send(page({
                title: `Found safe: ${a.child_name}`,
                description: `${a.child_name} has been found safe. Thank you for sharing and looking out.`,
                url,
                body: `<div class="card"><div class="content">
<span class="chip found">FOUND SAFE</span>
<h1>${esc(a.child_name)} has been found</h1>
<p class="sub">The family confirmed that ${esc(a.child_name)} is safe${a.resolved_at ? ` (${esc(sast(a.resolved_at))})` : ""}. Thank you to everyone who shared and looked out. You can stop sharing this alert.</p>
</div></div>
<p class="note">Shared from LocalAlert. The photo and details have been removed now that the alert is closed.</p>`,
            }));
        }

        const still = a.status === "still_missing";
        const image = a.photo_url ? `${baseUrl(req)}/a/${encodeURIComponent(req.params.code)}/photo` : null;
        const title = `MISSING: ${a.child_name}${a.age !== null ? `, ${a.age}` : ""}`;
        const description = `Last seen ${a.last_seen_place ? `near ${a.last_seen_place}` : `in ${a.municipality_name || "South Africa"}`}` +
            `${a.last_seen_time ? ` on ${sast(a.last_seen_time)}` : ""}. If you see them, call SAPS on 10111. Please share.`;

        res.send(page({
            title, description, image, url,
            body: `<div class="card">
${image ? `<img class="photo" src="${esc(image)}" alt="Photo of ${esc(a.child_name)}">` : ""}
<div class="content">
<div><span class="chip ${still ? "dark" : ""}">${still ? "STILL MISSING" : "MISSING"} · LEVEL ${a.escalation_level}</span></div>
<h1>${esc(a.child_name)}</h1>
<div class="sub">${esc(age)}${esc(personWord(a))}</div>
<div class="row"><div class="label">Last seen</div><div class="value">${esc(where)}${a.last_seen_time ? ` · ${esc(sast(a.last_seen_time))}` : ""}</div>${area ? `<div class="note" style="text-align:left;margin-top:4px">${esc(area)}</div>` : ""}</div>
${a.description ? `<div class="row"><div class="label">Description</div><div class="value">${esc(a.description)}</div></div>` : ""}
${a.clothing_description ? `<div class="row"><div class="label">Wearing</div><div class="value">${esc(a.clothing_description)}</div></div>` : ""}
<a class="btn primary" href="tel:10111">I have seen them · Call SAPS (10111)</a>
<a class="btn outline" href="${esc(openInApp)}">Open in the LocalAlert app</a>
</div></div>
<p class="note">These details come straight from LocalAlert and update automatically.<br>Reported ${esc(sast(a.created_at))} · checked ${esc(sast(new Date()))}</p>`,
        }));
    } catch (error) {
        console.error("Showing shared alert failed:", error.message);
        res.status(500).send("Something went wrong. Please try again.");
    }
}

// GET /a/:code/photo  (only while the person is still missing)
async function publicPhoto(req, res) {
    try {
        if (!CODE.test(req.params.code)) return res.status(404).end();
        const a = await Alert.findByShareCode(req.params.code);
        if (!a || !a.photo_url || a.status === "resolved") return res.status(404).end();
        res.set("Cache-Control", "public, max-age=300");
        res.sendFile(absolutePath(a.photo_url), (error) => {
            if (error && !res.headersSent) res.status(404).end();
        });
    } catch (error) {
        console.error("Showing shared photo failed:", error.message);
        res.status(500).end();
    }
}

module.exports = { createShareLink, followShared, publicPage, publicPhoto, shareUrl };
