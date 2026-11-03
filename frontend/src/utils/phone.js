// South African phone numbers (same rules as the backend's normaliseContactNumber).

// "082 123 4567", "+27 82 123 4567", "(012) 345-6789" -> "0821234567"; "" when empty; null when not valid.
export function normaliseContactNumber(value) {
  const digits = String(value ?? '').replace(/[\s()-]/g, '');
  if (!digits) return '';
  const local = digits.startsWith('+27') ? `0${digits.slice(3)}`
    : digits.startsWith('27') && digits.length === 11 ? `0${digits.slice(2)}` : digits;
  return /^0[1-8][0-9]{8}$/.test(local) ? local : null;
}

// "0821234567" -> "082 123 4567"
export function formatPhone(number) {
  return String(number || '').replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3');
}
