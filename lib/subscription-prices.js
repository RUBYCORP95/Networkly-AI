export const subscriptionPlans = [
  { code: "free", name: "Free" },
  { code: "pro", name: "Pro" },
  { code: "studio", name: "Studio" },
  { code: "business", name: "Business" },
  { code: "agency", name: "Agence" },
];

export function formatSubscriptionPrice(cents) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
