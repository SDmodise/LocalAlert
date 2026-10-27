import { apiRequest } from './api';

// Returns { municipality_id, municipality_name, province, ... } or null if the
// area is not covered yet. The coordinates are only used for the lookup.
export async function lookupMunicipality(latitude, longitude) {
  try {
    const data = await apiRequest(
      `/municipalities/lookup?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`
    );
    return data.municipality;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
