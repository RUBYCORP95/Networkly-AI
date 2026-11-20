import { formatEuros, parseCents } from "./money.mjs";

export function readDiscount(type, value) {
  const amount = parseCents(value);
  if (amount === null) return null;
  if (!["percent", "euros"].includes(type) || !Number.isInteger(amount) ||
      (type === "percent" && amount > 10000)) throw new Error("Remise invalide");
  return amount ? { type, amount } : null;
}

export function discountCents(base, discount) {
  if (!discount) return 0;
  return Math.min(base, discount.type === "percent"
    ? Math.round(base * discount.amount / 10000)
    : discount.amount);
}

export function lineTotal(item) {
  const gross = item.unit_cents * item.quantity;
  return gross - discountCents(gross, item.discount);
}

export function orderTotals(subtotal, discount, shipping) {
  const savings = subtotal === null ? 0 : discountCents(subtotal, discount);
  return { savings, net: subtotal === null ? null : subtotal - savings,
    total: subtotal === null ? null : subtotal - savings + shipping };
}

export function discountLabel(discount) {
  return discount.type === "percent"
    ? new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(discount.amount / 10000)
    : formatEuros(discount.amount);
}

export function savedOrderTotals(order) {
  const savings = order.order_discount?.applied_cents ?? 0;
  const net = order.total_cents;
  return { subtotal: net === null ? null : net + savings, savings,
    total: net === null ? null : net + order.shipping_cents };
}
