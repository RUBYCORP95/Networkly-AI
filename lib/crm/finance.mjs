import { afterDays, isDate, parisDate } from "./dates.mjs";
import { receiptNumber } from "./order-receipt.mjs";

export const financePath = "/consultant/analytique";
export const financeApi = "/api/consultant/finance";
export const categories = {
  case: "Mallettes", personal: "Produits personnels", sample: "Échantillons",
  equipment: "Matériel", transport: "Transport", other: "Autres", commission: "Commission Chogan",
};
export const periodTypes = { range: "Dates personnalisées", month: "Mois", quarter: "Trimestre", year: "Année" };
export const months = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(Date.UTC(2024, month, 1)));
export const saleLabels = { awaiting: "En attente", paid: "Payé", processed: "Traité et payé", cancelled: "Annulé", archive: "À rapprocher", excluded: "Hors totaux" };

function shortDate(date) {
  return date.slice(8, 10) + "/" + date.slice(5, 7) + "/" + date.slice(2, 4);
}

export function financePeriod(params, today = parisDate()) {
  const [currentYear, currentMonth] = today.split("-").map(Number);
  const type = typeof params.period === "string" && Object.hasOwn(periodTypes, params.period) ? params.period : "range";
  const year = typeof params.year === "string" && /^\d{4}$/.test(params.year) && Number(params.year) >= 1000 && Number(params.year) <= currentYear
    ? Number(params.year) : currentYear;
  const month = typeof params.month === "string" && /^(?:[1-9]|1[0-2])$/.test(params.month) ? Number(params.month) : currentMonth;
  const quarter = typeof params.quarter === "string" && /^[1-4]$/.test(params.quarter) ? Number(params.quarter) : Math.ceil(currentMonth / 3);
  if (type === "range") {
    const supplied = params.from !== undefined || params.to !== undefined;
    const valid = isDate(params.from) && isDate(params.to) && params.from <= params.to;
    const from = valid ? params.from : today.slice(0, 7) + "-01";
    const to = valid ? params.to : today;
    const label = "du " + shortDate(from) + " au " + shortDate(to);
    const query = new URLSearchParams({ period: type, from, to }).toString();
    return { type, year, month, quarter, start: from, to, label, query, today, invalid: supplied && !valid };
  }

  const first = { month, quarter: quarter * 3 - 2, year: 1 }[type];
  const length = { month: 1, quarter: 3, year: 12 }[type];
  const start = new Date(Date.UTC(year, first - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, first + length - 1, 0)).toISOString().slice(0, 10);
  const label = { month: months[month - 1] + " " + year, quarter: "T" + quarter + " " + year, year: String(year) }[type];
  const query = new URLSearchParams({ period: type, year, month, quarter }).toString();
  return { type, year, month, quarter, start, to, label, query, today };
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

const dayMilliseconds = 86_400_000;
const dayCount = (from, to) => (Date.parse(to) - Date.parse(from)) / dayMilliseconds;
const monthIndex = date => 12 * Number(date.slice(0, 4)) + Number(date.slice(5, 7)) - 1;

function chartGroups(period) {
  const days = dayCount(period.start, period.to);
  if (days < 31) {
    return {
      count: Math.floor(days / 7) + 1,
      index: date => Math.floor(dayCount(period.start, date) / 7),
      key: index => afterDays(period.start, index * 7),
      label: key => period.type === "month" ? String(Number(key.slice(8))) : shortDate(key).slice(0, 5),
      caption: "Montants par tranche de 7 jours",
    };
  }

  const firstMonth = monthIndex(period.start);
  const monthsInRange = monthIndex(period.to) - firstMonth + 1;
  if (monthsInRange <= 24) {
    return {
      count: monthsInRange,
      index: date => monthIndex(date) - firstMonth,
      key: index => {
        const month = firstMonth + index;
        return Math.floor(month / 12) + "-" + String(month % 12 + 1).padStart(2, "0");
      },
      label: key => period.start.slice(0, 4) === period.to.slice(0, 4)
        ? months[Number(key.slice(5)) - 1].slice(0, 3) + "." : key.slice(5) + "/" + key.slice(2, 4),
      caption: "Montants par mois",
    };
  }

  const firstYear = Number(period.start.slice(0, 4));
  const lastYear = Number(period.to.slice(0, 4));
  const step = Math.ceil((lastYear - firstYear + 1) / 12);
  return {
    count: Math.floor((lastYear - firstYear) / step) + 1,
    index: date => Math.floor((Number(date.slice(0, 4)) - firstYear) / step),
    key: index => String(firstYear + index * step),
    label: key => step === 1 ? key : key + "–" + Math.min(Number(key) + step - 1, lastYear),
    caption: step === 1 ? "Montants par année" : "Montants par groupe de " + step + " ans",
  };
}

export function financeReport(period, sales, entries) {
  const totals = empty();
  const chart = chartGroups(period);
  const buckets = Array.from({ length: chart.count }, (_, index) => {
    const key = chart.key(index);
    return { key, label: chart.label(key), ...empty() };
  });
  const bucket = date => buckets[chart.index(date)];
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
    sales, entries, expensesByCategory, chartCaption: chart.caption, buckets };
}
