/*
Maps a GPS position to a municipality.

Prototype method: the nearest municipality centre (centroid) within MAX_DISTANCE_KM.
This is less accurate near municipal borders. It will be replaced by a
point-in-boundary check (Turf.js with the municipal boundary file) once the
boundary data for the pilot region is added.
*/
const pool = require("../config/database");
const { distanceKm } = require("../utils/distance");

const MAX_DISTANCE_KM = 80;

function isValidCoordinate(latitude, longitude) {
    return (
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180
    );
}

async function findMunicipality(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!isValidCoordinate(lat, lon)) return null;

    const result = await pool.query(`
        SELECT municipality_id, municipality_code, municipality_name, province,
               centroid_latitude, centroid_longitude
        FROM municipalities
        WHERE centroid_latitude IS NOT NULL AND centroid_longitude IS NOT NULL;
    `);

    let nearest = null;
    for (const row of result.rows) {
        const km = distanceKm(lat, lon, Number(row.centroid_latitude), Number(row.centroid_longitude));
        if (!nearest || km < nearest.km) {
            nearest = { row, km };
        }
    }

    if (!nearest || nearest.km > MAX_DISTANCE_KM) {
        // Diagnostic only (console, never stored). The position is rounded to
        // about 10 km so the exact location is not written to the log.
        console.log(
            `[municipality lookup] no match for position near ${lat.toFixed(1)}, ${lon.toFixed(1)}: ` +
            (nearest
                ? `nearest is ${nearest.row.municipality_name} at ${nearest.km.toFixed(0)} km (limit ${MAX_DISTANCE_KM} km)`
                : `no municipalities have centre points (${result.rows.length} rows)`)
        );
        return null;
    }
    const { municipality_id, municipality_code, municipality_name, province } = nearest.row;
    return { municipality_id, municipality_code, municipality_name, province };
}

module.exports = { findMunicipality, isValidCoordinate };
