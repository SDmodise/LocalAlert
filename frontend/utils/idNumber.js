/*
Same check as the backend (backend/src/services/idValidator.js), used here only
to give instant feedback while typing. The backend always checks again.
*/
function luhnValid(digits) {
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[i]);
    if ((i + 1) % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

// Returns null when valid, otherwise a short reason.
export function idNumberProblem(idNumber, dateOfBirth, gender) {
  const id = String(idNumber || '').replace(/\s/g, '');
  if (!/^[0-9]{13}$/.test(id)) return 'An ID number must be exactly 13 digits.';
  const [year, month, day] = String(dateOfBirth || '').split('-');
  if (!year || id.slice(0, 2) !== year.slice(2) || id.slice(2, 4) !== month || id.slice(4, 6) !== day) {
    return 'The date digits do not match the date of birth.';
  }
  if (gender && (Number(id.slice(6, 10)) < 5000 ? 'Female' : 'Male') !== gender) {
    return 'The gender digits do not match the profile.';
  }
  if (id[10] !== '0' && id[10] !== '1') return 'The citizenship digit must be 0 or 1.';
  if (!luhnValid(id)) return 'The check digit is not valid. Check the number.';
  return null;
}

export function ageInYears(dateOfBirth) {
  const [y, m, d] = String(dateOfBirth || '').split('-').map(Number);
  if (!y) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}
