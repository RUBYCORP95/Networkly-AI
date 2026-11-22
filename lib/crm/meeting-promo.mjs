export function meetingPromoCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,29}$/.test(code) ? code : null;
}
