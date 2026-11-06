/*
npm run share-tunnel

Starts a Cloudflare quick tunnel to this backend and saves its public address as
PUBLIC_BASE_URL in backend/.env, so shared alert links open for anyone, anywhere.

It also saves <address>/api as EXPO_PUBLIC_REMOTE_API_URL in frontend/.env, so the app
opened with "npm run remote" (phones on other networks) reaches the backend through it.
Restart "npm run remote" after starting this, so the app picks up the new address.

A quick tunnel gets a NEW random address every time it starts, so run this command
instead of starting cloudflared by hand. With "npm run dev" running, the backend
restarts by itself when .env changes and picks up the new address.
Keep this window open: when it closes, the share links stop working until it is
started again (links shared earlier then point to an address that no longer exists).
*/
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ENV_FILE = path.join(__dirname, "..", ".env");
require("dotenv").config({ path: ENV_FILE, quiet: true });
const port = Number(process.env.PORT) || 5000;
const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const command = process.env.CLOUDFLARED || "cloudflared";

// Replaces (or adds) the PUBLIC_BASE_URL line, keeping the rest of .env as it is.
function savePublicUrl(url) {
    const text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const line = `PUBLIC_BASE_URL=${url}`;
    let updated;
    if (/^PUBLIC_BASE_URL=.*$/m.test(text)) {
        updated = text.replace(/^PUBLIC_BASE_URL=.*$/m, line);
    } else {
        updated = text + (text && !text.endsWith("\n") ? newline : "") + line + newline;
    }
    if (updated !== text) fs.writeFileSync(ENV_FILE, updated);
}

// The app's backend address for phones on other networks (frontend/.env).
const APP_ENV_FILE = path.join(__dirname, "..", "..", "frontend", ".env");
function saveAppUrl(url) {
    if (!fs.existsSync(APP_ENV_FILE)) return false;
    const text = fs.readFileSync(APP_ENV_FILE, "utf8");
    const newline = text.includes("\r\n") ? "\r\n" : "\n";
    const line = `EXPO_PUBLIC_REMOTE_API_URL=${url}/api`;
    const updated = /^[ \t]*EXPO_PUBLIC_REMOTE_API_URL=.*$/m.test(text)
        ? text.replace(/^[ \t]*EXPO_PUBLIC_REMOTE_API_URL=.*$/m, line)
        : text + (text && !text.endsWith("\n") ? newline : "") + line + newline;
    if (updated !== text) fs.writeFileSync(APP_ENV_FILE, updated);
    return true;
}

console.log(`Starting a Cloudflare tunnel to http://localhost:${port} ...`);
const tunnel = spawn(command, ["tunnel", "--protocol", "http2", "--url", `http://localhost:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
});

let found = false;
function onOutput(chunk) {
    for (const line of chunk.toString().split(/\r?\n/)) {
        const match = !found && line.match(URL_PATTERN);
        if (match) {
            found = true;
            savePublicUrl(match[0]);
            const app = saveAppUrl(match[0]);
            console.log("");
            console.log("  Share links now use:");
            console.log(`  ${match[0]}`);
            console.log("");
            console.log("  Saved as PUBLIC_BASE_URL in backend/.env. If \"npm run dev\" is running, the");
            console.log("  backend restarts by itself; otherwise restart it. Keep this window open.");
            if (app) {
                console.log("  Also saved for the app in frontend/.env: (re)start \"npm run remote\" now.");
            }
            console.log("  (Press Ctrl+C to stop the tunnel.)");
        } else if (/\bERR\b|error/i.test(line) && !/Failed to initialize DNS local resolver/.test(line)) {
            console.log(line.trim());
        }
    }
}
tunnel.stdout.on("data", onOutput);
tunnel.stderr.on("data", onOutput);

tunnel.on("error", (error) => {
    if (error.code === "ENOENT") {
        console.error("cloudflared was not found. Install it (winget install --id Cloudflare.cloudflared),");
        console.error("then close and reopen this window so Windows finds it, and run this command again.");
    } else {
        console.error("Could not start cloudflared:", error.message);
    }
    process.exit(1);
});
tunnel.on("exit", (code) => {
    console.log(found ? "The tunnel has stopped, so share links no longer open." : `cloudflared stopped (code ${code}) before giving an address.`);
    process.exit(code || 0);
});

const stop = () => tunnel.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
