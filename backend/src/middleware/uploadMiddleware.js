/*
Handles photo and ID document uploads (multipart/form-data).

Files are saved outside the public web root under UPLOAD_DIR with random names
and are only served through permission-checked endpoints (FR27, NFR10).
*/
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads"));
const FOLDERS = { photo: "photos", id_document: "id_documents" };
const SIGHTINGS_FOLDER = "sightings";
const IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
};
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

for (const folder of [...Object.values(FOLDERS), SIGHTINGS_FOLDER]) {
    fs.mkdirSync(path.join(UPLOAD_DIR, folder), { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOAD_DIR, FOLDERS[file.fieldname])),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + IMAGE_TYPES[file.mimetype]),
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_BYTES, files: 2 },
    fileFilter: (req, file, cb) => {
        if (!FOLDERS[file.fieldname]) return cb(new Error("Unexpected file."));
        if (!IMAGE_TYPES[file.mimetype]) return cb(new Error("Only photos (JPEG, PNG, WebP or HEIC) can be uploaded."));
        cb(null, true);
    },
});

const profileFiles = upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "id_document", maxCount: 1 },
]);

// Runs multer and turns its errors into a clear 400 response.
function profileUpload(req, res, next) {
    profileFiles(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE" ? "Each photo must be smaller than 8 MB." : error.message;
        res.status(400).json({ success: false, message });
    });
}

// Sighting reports: one optional photo, saved under uploads/sightings.
const sightingFile = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, path.join(UPLOAD_DIR, SIGHTINGS_FOLDER)),
        filename: (req, file, cb) => cb(null, crypto.randomUUID() + IMAGE_TYPES[file.mimetype]),
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
        if (file.fieldname !== "photo") return cb(new Error("Unexpected file."));
        if (!IMAGE_TYPES[file.mimetype]) return cb(new Error("Only photos (JPEG, PNG, WebP or HEIC) can be uploaded."));
        cb(null, true);
    },
}).fields([{ name: "photo", maxCount: 1 }]);

function sightingUpload(req, res, next) {
    sightingFile(req, res, (error) => {
        if (!error) return next();
        const message = error.code === "LIMIT_FILE_SIZE" ? "The photo must be smaller than 8 MB." : error.message;
        res.status(400).json({ success: false, message });
    });
}

// Path stored in the database, e.g. "photos/<uuid>.jpg" (folder taken from where multer saved it)
function storedPath(file) {
    return file ? `${path.basename(file.destination)}/${file.filename}` : null;
}

function absolutePath(stored) {
    const full = path.resolve(UPLOAD_DIR, stored);
    if (!full.startsWith(UPLOAD_DIR + path.sep)) throw new Error("Invalid file path.");
    return full;
}

function removeUploaded(req) {
    for (const list of Object.values(req.files || {})) {
        for (const file of list) fs.unlink(file.path, () => {});
    }
}

module.exports = { profileUpload, sightingUpload, storedPath, absolutePath, removeUploaded };
