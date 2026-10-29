/*
Loaded first by every test file. Points the backend at a separate TEST database and a
temporary uploads folder, so running the tests never touches real users, alerts or photos.

  Test database: TEST_DB_NAME from .env, or "<DB_NAME>_test" (e.g. amber_alert_db_test).
  Uploads:       a "localalert-test-uploads" folder in the system temp folder.
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const BE = path.resolve(__dirname, "..");
process.chdir(BE);
process.env.DOTENV_CONFIG_QUIET = "true";
require("dotenv").config({ path: path.join(BE, ".env"), quiet: true });

if (!process.env.TEST_DB_NAME && !process.env.DB_NAME) throw new Error("Set DB_NAME in backend/.env first.");
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || `${process.env.DB_NAME}_test`;
process.env.DB_NAME = process.env.TEST_DB_NAME;
process.env.DOTENV_CONFIG_QUIET = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "local-test-secret";
// Never send real emails while testing.
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const UPLOADS = path.join(os.tmpdir(), "localalert-test-uploads");
process.env.UPLOAD_DIR = UPLOADS;

// A small solid-colour PNG, generated here so no real photo is stored in the project.
function samplePng(width = 40, height = 50) {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buf) => {
        let c = 0xffffffff;
        for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type), data]);
        const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
        return Buffer.concat([len, body, sum]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
    header[8] = 8; header[9] = 2; // 8-bit RGB
    const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([0x15, 0x59, 0xd6]))]);
    const pixels = zlib.deflateSync(Buffer.concat(Array(height).fill(row)));
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0)),
    ]);
}

// Sample files the tests refer to.
const SAMPLE_PHOTO = "photos/d4639b39-a73e-42c9-aef0-144c6a715178.png";
const SAMPLE_ID_DOCUMENT = "id_documents/0b4233c6-a485-4834-9ad5-2d902ea05349.png";
for (const folder of ["photos", "id_documents", "sightings", "alert_photos"]) {
    fs.mkdirSync(path.join(UPLOADS, folder), { recursive: true });
}
for (const file of [SAMPLE_PHOTO, SAMPLE_ID_DOCUMENT]) {
    const full = path.join(UPLOADS, file);
    if (!fs.existsSync(full)) fs.writeFileSync(full, samplePng());
}

module.exports = { BE, UPLOADS };
