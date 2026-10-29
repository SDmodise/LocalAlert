/*
Maps a GPS position to a municipality.

Method: point-in-boundary. The official municipal boundaries (Municipal Demarcation
Board, all 213 metros and local municipalities, file src/data/municipal-boundaries.geojson)
are loaded once; the position is matched to the municipality whose boundary contains it.
Positions just outside every boundary (for example on a beach, or on the edge of the
simplified outline) are matched to a municipality whose border is within EDGE_TOLERANCE_KM.
Anything further away (outside South Africa) is "not covered".

The coordinates are only used for this lookup; they are never stored.
*/
const fs = require("fs");
const path = require("path");
const pool = require("../config/database");

const BOUNDARY_FILE = path.join(__dirname, "..", "data", "municipal-boundaries.geojson");
const EDGE_TOLERANCE_KM = 5;
const KM_PER_DEG = 111.32;

function isValidCoordinate(latitude, longitude) {
    return (
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180
    );
}

// ---- boundaries ---------------------------------------------------------------

let boundaries = null; // [{ code, polygons: [[ring, ...holes]], bbox: [minX, minY, maxX, maxY] }]

function loadBoundaries() {
    if (boundaries) return boundaries;
    const data = JSON.parse(fs.readFileSync(BOUNDARY_FILE, "utf8"));
    boundaries = data.features.map((f) => {
        const polygons = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const polygon of polygons) {
            for (const [x, y] of polygon[0]) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        return { code: f.properties.code, polygons, bbox: [minX, minY, maxX, maxY] };
    });
    return boundaries;
}

// Ray casting: is the point inside this ring?
function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function inPolygon(x, y, polygon) {
    if (!inRing(x, y, polygon[0])) return false;
    for (let h = 1; h < polygon.length; h++) if (inRing(x, y, polygon[h])) return false; // holes
    return true;
}

// Distance in km from the point to the nearest border segment.
function distanceToBorderKm(x, y, polygons) {
    const kx = KM_PER_DEG * Math.cos((y * Math.PI) / 180);
    const ky = KM_PER_DEG;
    let best = Infinity;
    for (const polygon of polygons) {
        for (const ring of polygon) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const ax = (ring[j][0] - x) * kx, ay = (ring[j][1] - y) * ky;
                const bx = (ring[i][0] - x) * kx, by = (ring[i][1] - y) * ky;
                const dx = bx - ax, dy = by - ay;
                const len2 = dx * dx + dy * dy;
                const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
                const px = ax + t * dx, py = ay + t * dy;
                const d = Math.sqrt(px * px + py * py);
                if (d < best) best = d;
            }
        }
    }
    return best;
}

// Returns the municipality code for a position, or null outside South Africa.
function codeAt(latitude, longitude) {
    const x = longitude, y = latitude;
    const all = loadBoundaries();
    for (const b of all) {
        const [minX, minY, maxX, maxY] = b.bbox;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        if (b.polygons.some((p) => inPolygon(x, y, p))) return b.code;
    }
    // Not inside any boundary: accept the closest border within the tolerance.
    const margin = EDGE_TOLERANCE_KM / 100; // degrees, generous
    let nearest = null;
    for (const b of all) {
        const [minX, minY, maxX, maxY] = b.bbox;
        if (x < minX - margin || x > maxX + margin || y < minY - margin || y > maxY + margin) continue;
        const d = distanceToBorderKm(x, y, b.polygons);
        if (d <= EDGE_TOLERANCE_KM && (!nearest || d < nearest.d)) nearest = { code: b.code, d };
    }
    return nearest ? nearest.code : null;
}

// ---- lookups ------------------------------------------------------------------

async function findMunicipality(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!isValidCoordinate(lat, lon)) return null;

    const code = codeAt(lat, lon);
    if (!code) {
        // Diagnostic only (console, never stored), rounded to about 10 km.
        console.log(`[municipality lookup] no municipality for position near ${lat.toFixed(1)}, ${lon.toFixed(1)}`);
        return null;
    }
    const result = await pool.query(
        `SELECT municipality_id, municipality_code, municipality_name, province
         FROM municipalities WHERE municipality_code = $1;`,
        [code]
    );
    if (!result.rows[0]) {
        console.log(`[municipality lookup] ${code} is in the boundary file but not in the database: run db/009_all_municipalities.sql`);
        return null;
    }
    return result.rows[0];
}

// All covered municipalities, for choosing one by hand when the location can't be found.
async function listMunicipalities() {
    const result = await pool.query(`
        SELECT municipality_id, municipality_code, municipality_name, province
        FROM municipalities
        ORDER BY province, municipality_name;
    `);
    return result.rows;
}

async function findMunicipalityById(id) {
    if (!Number.isInteger(id) || id <= 0) return null;
    const result = await pool.query(
        `SELECT municipality_id, municipality_code, municipality_name, province
         FROM municipalities WHERE municipality_id = $1;`,
        [id]
    );
    return result.rows[0] || null;
}

module.exports = { findMunicipality, isValidCoordinate, listMunicipalities, findMunicipalityById, codeAt };
