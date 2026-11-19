const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatEuros(cents) {
  return euros.format(cents / 100);
}

export function parseCents(value) {
  const amount = String(value ?? "").trim().replace(",", ".");
  if (!amount) return null;
  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(amount);
  return match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : NaN;
}
