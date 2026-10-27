/*
South African ID number check (FR37, Phase 4 section 4.6.2).

YYMMDD SSSS C A Z
  YYMMDD  date of birth            -> must match the profile's date of birth
  SSSS    0000-4999 female, 5000-9999 male -> must match the profile's gender
  C       0 citizen, 1 permanent resident
  A       usually 8
  Z       check digit (Luhn algorithm)

The number is only checked. It is never stored or logged.
*/

function luhnValid(digits) {
    let total = 0;
    for (let i = 0; i < digits.length; i++) {
        let d = Number(digits[i]);
        // Positions are counted from the left starting at 1; even positions are doubled.
        if ((i + 1) % 2 === 0) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        total += d;
    }
    return total % 10 === 0;
}

// dateOfBirth: "YYYY-MM-DD", gender: "Female" | "Male"
function validateIdNumber(idNumber, dateOfBirth, gender) {
    const id = String(idNumber || "").replace(/\s/g, "");

    if (!/^[0-9]{13}$/.test(id)) {
        return { valid: false, reason: "An ID number must be exactly 13 digits." };
    }

    const [year, month, day] = String(dateOfBirth || "").split("-");
    if (!year || id.slice(0, 2) !== year.slice(2) || id.slice(2, 4) !== month || id.slice(4, 6) !== day) {
        return { valid: false, reason: "The date digits do not match the date of birth." };
    }

    const idGender = Number(id.slice(6, 10)) < 5000 ? "Female" : "Male";
    if (idGender !== gender) {
        return { valid: false, reason: "The gender digits do not match the profile." };
    }

    if (id[10] !== "0" && id[10] !== "1") {
        return { valid: false, reason: "The citizenship digit must be 0 or 1." };
    }

    if (!luhnValid(id)) {
        return { valid: false, reason: "The check digit is not valid. Check the number." };
    }

    return { valid: true };
}

module.exports = { validateIdNumber, luhnValid };
