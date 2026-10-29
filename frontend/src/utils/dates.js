// Small date helpers for the alert forms (local phone time).

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const pad = (n) => String(n).padStart(2, '0');

// "14:05"
export const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Local calendar date, `daysAgo` days before today, as YYYY-MM-DD.
export function isoDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "Tue 27 Oct"
export function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]} ${d} ${MONTHS_SHORT[m - 1]}`;
}

// Combines a YYYY-MM-DD day and an HH:MM time into a Date, or null if the time is not valid.
export function lastSeenDate(day, time) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!m) return null;
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, Number(m[1]), Number(m[2]), 0, 0);
}

// "Scheduled for 18:30", "Scheduled for tomorrow 00:30" or "Scheduled for 2/11 06:30"
export function scheduledText(iso) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const day = d.toDateString() === today.toDateString() ? ''
    : d.toDateString() === tomorrow.toDateString() ? 'tomorrow '
      : `${d.getDate()}/${d.getMonth() + 1} `;
  return `Scheduled for ${day}${clock(d)}`;
}
