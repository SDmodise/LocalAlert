import { apiRequest } from './api';
import { getToken } from './auth';

// Family Administrators: the family's alerts summed up, one row per alert.
export async function getFamilyReport() {
  const data = await apiRequest('/reports/family', { token: await getToken() });
  return data.report;
}

// One alert's report: timeline, people alerted, sightings.
export async function getAlertReport(alertId) {
  const data = await apiRequest(`/reports/alerts/${alertId}`, { token: await getToken() });
  return data.report;
}
