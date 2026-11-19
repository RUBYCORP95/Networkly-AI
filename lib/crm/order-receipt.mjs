import { formatDate, parisDate } from "./dates.mjs";
import { formatEuros } from "./money.mjs";

export const orderStatuses = [
  ["pending", "En attente"], ["confirmed", "Confirmée"], ["completed", "Terminée"], ["cancelled", "Annulée"],
];
export const paymentStatuses = [["pending", "En attente"], ["paid", "Payé"], ["later", "À payer plus tard"]];
export const sellerFields = [
  ["name", "Nom professionnel", 120], ["business", "Nom de l’entreprise", 120], ["email", "E-mail professionnel", 254],
  ["phone", "Téléphone professionnel", 40], ["address", "Adresse professionnelle", 500], ["registration", "SIRET ou identifiant d’entreprise", 50],
];

export function receiptNumber(id) {
  return "BC-" + id.replaceAll("-", "").slice(0, 12).toUpperCase();
}

export function receiptDate(order) {
  return formatDate(parisDate(new Date(order.created_at)));
}

export function receiptText(order) {
  const { seller, buyer } = order;
  const lines = order.items.map(item => [
    item.quantity + " × " + item.title, item.format, item.reference && "Réf. " + item.reference,
    formatEuros(item.unit_cents) + " / unité", formatEuros(item.quantity * item.unit_cents),
  ].filter(Boolean).join(" · "));
  const totals = [
    "Sous-total produits : " + (order.total_cents === null ? "à confirmer" : formatEuros(order.total_cents)),
    "Livraison : " + formatEuros(order.shipping_cents),
    "Total : " + (order.total_cents === null ? "à confirmer" : formatEuros(order.total_cents + order.shipping_cents)),
  ];
  return [
    "Bon de commande " + receiptNumber(order.id), receiptDate(order),
    "", "Votre consultant", ...sellerFields.map(([key]) => seller[key]).filter(Boolean),
    "", "Client : " + (buyer.name || ""), "", ...(lines.length ? lines : [order.details]),
    "", ...totals, "Paiement : " + (new Map(paymentStatuses).get(order.payment_status) ?? "En attente"),
  ].join("\n");
}
