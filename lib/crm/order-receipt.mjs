import { formatDate, parisDate } from "./dates.mjs";
import { publicPaymentLinks } from "./payment-links.mjs";
import { formatEuros } from "./money.mjs";

import { discountCents, discountLabel, lineTotal, savedOrderTotals } from "./order-pricing.mjs";

export const orderFields = "id,details,total_cents,shipping_cents,items,order_discount,status,payment_status,order_date,created_at,buyer,seller";

export function itemDiscountText(item) {
  return item.discount && discountText(item.discount, discountCents(item.quantity * item.unit_cents, item.discount));
}

export function discountText(discount, appliedCents) {
  return "Remise " + discountLabel(discount) + " (−" + formatEuros(appliedCents) + ")";
}

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

export function orderDate(order) {
  return order.order_date ?? parisDate(new Date(order.created_at));
}

export function receiptDate(order) {
  return formatDate(orderDate(order));
}

export function receiptText(order) {
  const { seller, buyer } = order;
  const { subtotal, savings, total } = savedOrderTotals(order);
  const lines = order.items.map(item => [
    item.quantity + " × " + item.title, item.format, item.reference && "Réf. " + item.reference,
    formatEuros(item.unit_cents) + " / unité", itemDiscountText(item),
    formatEuros(lineTotal(item)), lineTotal(item) === 0 && "Offert",
  ].filter(Boolean).join(" · "));
  const totals = [
    "Sous-total produits : " + (subtotal === null ? "à confirmer" : formatEuros(subtotal)),
    ...(order.order_discount ? ["Remise globale " + discountLabel(order.order_discount) + " : −" + formatEuros(savings)] : []),
    "Livraison : " + formatEuros(order.shipping_cents),
    "Total : " + (total === null ? "à confirmer" : formatEuros(total)),
  ];
  return [
    "Bon de commande " + receiptNumber(order.id), receiptDate(order),
    "", "Votre consultant", ...sellerFields.map(([key]) => seller[key]).filter(Boolean),
    "", "Client : " + (buyer.name || ""), "", ...(lines.length ? lines : [order.details]),
    "", ...totals, "Paiement : " + (new Map(paymentStatuses).get(order.payment_status) ?? "En attente"),
  ].join("\n");
}

function needsPayment(order) {
  return order.payment_status !== "paid" && order.status !== "cancelled";
}

export function receiptEmailText(order, paymentLinks = []) {
  const links = needsPayment(order) ? publicPaymentLinks(paymentLinks) : [];
  return [
    order.buyer?.name ? "Bonjour " + order.buyer.name + "," : "Bonjour,",
    "",
    "Voici le récapitulatif de votre commande.",
    "",
    receiptText(order),
    ...(links.length ? ["", "Moyens de paiement", ...links.flatMap(({ label, url }) => [label, url])] : []),
    ...(needsPayment(order) ? ["", "Merci d’indiquer le numéro de commande " + receiptNumber(order.id) + " dans la note de ton paiement."] : []),
    "",
    "Une question ? Vous pouvez contacter votre consultant.",
  ].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

export function receiptEmailHtml(order, paymentLinks = []) {
  const links = needsPayment(order) ? publicPaymentLinks(paymentLinks) : [];
  const paymentSection = links.length ? '<h2 style="font-size:16px">Moyens de paiement</h2><ul>' +
    links.map(({ label, url }) => '<li><a href="' + escapeHtml(url) + '">' +
      escapeHtml(label) + '</a><br><span style="overflow-wrap:anywhere">' + escapeHtml(url) + '</span></li>').join("") + '</ul>' : "";
  const [greeting, , intro, , number, date, , ...details] = receiptEmailText(order).split("\n");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><body style="margin:0;background:#f5f2fb;color:#272039;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e4dbf4;border-radius:16px;overflow:hidden">
  <tr><td style="padding:24px;background:#5634a8;color:#fff"><strong>TESAMI</strong><h1 style="margin:12px 0 8px;font-size:24px">${escapeHtml(number)}</h1><p style="margin:0">${escapeHtml(date)}</p></td></tr>
  <tr><td style="padding:24px;line-height:1.6"><p style="margin:0 0 8px">${escapeHtml(greeting)}</p><p style="margin:0 0 20px">${escapeHtml(intro)}</p>
  <div style="background:#f5f2fb;border-radius:12px;padding:16px;overflow-wrap:anywhere">${details.map(escapeHtml).join("<br>")}</div>
  ${paymentSection}
  </td></tr></table></td></tr></table></body></html>`;
}
