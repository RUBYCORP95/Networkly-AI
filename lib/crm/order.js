import { getVariants, requireEuroCatalogue } from "./catalogue";

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

export async function priceOrder(lines) {
  const handles = [...new Set(lines.map(line => line.handle))];
  const [, variants] = await Promise.all([requireEuroCatalogue(), Promise.all(handles.map(getVariants))]);
  const available = new Map(variants.flat().map(item => [item.id, item]));
  const items = lines.map(line => {
    const item = available.get(line.id);
    if (!item || item.handle !== line.handle) throw new Error("Variante indisponible");
    return { ...item, quantity: line.quantity };
  });
  const total = items.reduce((sum, item) => sum + item.unit_cents * item.quantity, 0);
  if (total > 99999999) throw new Error("Montant trop élevé");
  return { items, total };
}
