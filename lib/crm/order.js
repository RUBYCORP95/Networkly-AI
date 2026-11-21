import { lineTotal, readDiscount } from "./order-pricing.mjs";
import { parseCents } from "./money.mjs";
import { getVariants, requireEuroCatalogue } from "./catalogue.js";

export function readLines(raw) {
  try {
    const lines = JSON.parse(raw || "[]");
    if (!Array.isArray(lines) || lines.length > 20 ||
        lines.some(line => !line || typeof line.handle !== "string" ||
          typeof line.id !== "string" || !/^[0-9]{1,24}$/.test(line.id) ||
          !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) ||
        new Set(lines.map(line => line.id)).size !== lines.length) return null;
    return lines;
  } catch {
    return null;
  }
}

export async function priceOrder(lines, { customPricing = false, existingItems = [] } = {}) {
  const available = new Map(existingItems.map(item => [item.id, item]));
  const handles = [...new Set(lines.filter(line => !available.has(line.id)).map(line => line.handle))];
  if (handles.length) {
    const [, variants] = await Promise.all([requireEuroCatalogue(), Promise.all(handles.map(getVariants))]);
    for (const item of variants.flat()) {
      if (!available.has(item.id)) available.set(item.id, item);
    }
  }
  const items = lines.map(line => {
    const saved = available.get(line.id);
    if (!saved || saved.handle !== line.handle) throw new Error("Variante indisponible");
    const { discount: savedDiscount, ...item } = saved;
    const unitCents = customPricing ? parseCents(line.price) : null;
    if (Number.isNaN(unitCents)) throw new Error("Prix invalide");
    const discount = customPricing ? readDiscount(line.discountType, line.discountValue) : null;
    return { ...item, unit_cents: unitCents ?? item.unit_cents, quantity: line.quantity,
      ...(discount && { discount }) };
  });
  const total = items.reduce((sum, item) => sum + lineTotal(item), 0);
  if (total > 99999999) throw new Error("Montant trop élevé");
  return { items, total };
}
