import { apiRequest } from './api';
import { getToken } from './auth';

// Returns { unread_count, notifications: [...] } (newest first).
export async function getNotifications(limit = 50) {
  return apiRequest(`/notifications?limit=${limit}`, { token: await getToken() });
}

export async function getUnreadCount() {
  const data = await apiRequest('/notifications/unread-count', { token: await getToken() });
  return data.unread_count;
}

// ids: array of notification ids, or 'all'
export async function markNotificationsRead(ids) {
  const body = ids === 'all' ? { all: true } : { ids };
  return apiRequest('/notifications/read', { method: 'POST', token: await getToken(), body });
}
