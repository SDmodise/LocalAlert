/*
Great-circle distance between two GPS points (Haversine formula), in kilometres.
*/
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

module.exports = { distanceKm };
