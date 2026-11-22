import { parisDate } from "./dates.mjs";
import { receiptNumber } from "./order-receipt.mjs";

export const financePath = "/consultant/analytique";
export const financeApi = "/api/consultant/finance";
export const categories = {
  case: "Mallettes", personal: "Produits personnels", sample: "Échantillons",
  equipment: "Matériel", transport: "Transport", other: "Autres", commission: "Commission Chogan",
};
export const periodTypes = { month: "Mois", quarter: "Trimestre", year: "Année" };
export const months = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(Date.UTC(2024, month, 1)));
export const saleLabels = { awaiting: "En attente", paid: "Payé", processed: "Traité et payé", cancelled: "Annulé", archive: "À rapprocher", excluded: "Hors totaux" };

export function financePeriod(params, today = parisDate()) {
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const type = typeof params.period === "string" && Object.hasOwn(periodTypes, params.period) ? params.period : "month";
  const year = typeof params.year === "string" && /^\d{4}$/.test(params.year) && Number(params.year) >= 1000 && Number(params.year) <= currentYear
    ? Number(params.year) : currentYear;
  const month = typeof params.month === "string" && /^(?:[1-9]|1[0-2])$/.test(params.month) ? Number(params.month) : currentMonth;
  const quarter = typeof params.quarter === "string" && /^[1-4]$/.test(params.quarter) ? Number(params.quarter) : Math.ceil(currentMonth / 3);
  const first = { month, quarter: quarter * 3 - 2, year: 1 }[type];
  const length = { month: 1, quarter: 3, year: 12 }[type];
  const iso = value => new Date(Date.UTC(year, value - 1, 1)).toISOString().slice(0, 10);
  const label = { month: months[month - 1] + " " + year, quarter: "T" + quarter + " " + year, year: String(year) }[type];
  const query = new URLSearchParams({ period: type, year, month, quarter }).toString();
  return { type, year, month, quarter, start: iso(first), end: iso(first + length), label, query, today };
}

export function saleState(sale) {
  if (sale.status === "cancelled") return "cancelled";
  if (sale.status === "archive" || sale.status === "excluded") return sale.status;
  if (sale.payment_status !== "paid") return "awaiting";
  return ["confirmed", "completed"].includes(sale.status) ? "processed" : "paid";
}

export function saleReference(sale) {
  return sale.source === "order" ? receiptNumber(sale.id) : (sale.invoice_reference ?? sale.invoice_name);
}

const empty = () => ({ revenue: 0, expenses: 0, commissions: 0, costs: 0, awaiting: 0, paid: 0,
  processed: 0, orders: 0, linked: 0, archives: 0, unknownAmounts: 0, unknownCosts: 0, knownCosts: 0 });

function addSale(totals, sale) {
  if (sale.source === "order") {
    totals.orders++;
    if (sale.invoice_id) totals.linked++;
  }
  const state = saleState(sale);
  if (state === "archive") totals.archives++;
  if (state === "awaiting") totals.awaiting++;
  if (state !== "processed" && state !== "paid") return;
  totals.paid++;
  if (state === "processed") totals.processed++;
  if (sale.amount_cents === null) totals.unknownAmounts++;
  else totals.revenue += sale.amount_cents;
  if (sale.product_cost_cents === null) totals.unknownCosts++;
  else {
    totals.knownCosts++;
    totals.costs += sale.product_cost_cents;
  }
}

function addEntry(totals, entry) {
  totals[entry.category === "commission" ? "commissions" : "expenses"] += entry.amount_cents;
}

export function financeReport(period, sales, entries) {
  const totals = empty();
  const buckets = new Map();
  const byMonth = period.type !== "month";
  for (const date = new Date(period.start); date.toISOString().slice(0, 10) < period.end;) {
    const key = date.toISOString().slice(0, byMonth ? 7 : 10);
    const label = byMonth ? months[date.getUTCMonth()].slice(0, 3) + "." : String(date.getUTCDate());
    buckets.set(key, { key, label, ...empty() });
    if (byMonth) date.setUTCMonth(date.getUTCMonth() + 1);
    else date.setUTCDate(date.getUTCDate() + 7);
  }

  const bucket = date => buckets.get(byMonth ? date.slice(0, 7) : date.slice(0, 8) +
    String(1 + 7 * Math.floor((Number(date.slice(8)) - 1) / 7)).padStart(2, "0"));
  for (const sale of sales) {
    addSale(totals, sale);
    addSale(bucket(sale.sale_date), sale);
  }
  for (const entry of entries) {
    addEntry(totals, entry);
    addEntry(bucket(entry.entry_date), entry);
  }

  const expensesByCategory = Object.keys(categories).filter(key => key !== "commission")
    .map(key => ({ key, label: categories[key], total: 0 }));
  const expenseTotals = new Map(expensesByCategory.map(row => [row.key, row]));
  for (const entry of entries) {
    const group = expenseTotals.get(entry.category);
    if (group) group.total += entry.amount_cents;
  }
  const result = totals.revenue + totals.commissions - totals.expenses - totals.costs;
  return { period, totals, result, incomplete: Boolean(totals.unknownCosts || totals.unknownAmounts || totals.archives),
    sales, entries, expensesByCategory, buckets: [...buckets.values()] };
}
