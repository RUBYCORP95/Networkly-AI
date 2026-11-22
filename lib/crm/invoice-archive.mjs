import { isDate, parisDate } from "./dates.mjs";
import { financePeriod } from "./finance.mjs";

export const invoicePath = "/consultant/factures";
export const invoiceApi = "/api/consultant/invoices";
export const maxInvoiceBytes = 3 * 1024 * 1024;
export const maxInvoiceBatch = 500;
export const invoiceReviewPageSize = 25;
export const invoiceNatures = { subscription: "Abonnement", equipment: "Matériel", other: "Autre" };

export const invoiceNature = value => typeof value === "string" && Object.hasOwn(invoiceNatures, value) ? value : null;


export async function processInvoiceBatch(items, processItem) {
  const remaining = items.values();
  const workers = Array.from({ length: Math.min(items.length, 4) }, async () => {
    for (const item of remaining) await processItem(item);
  });
  await Promise.all(workers);
}

export function invoiceUploadGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = issuerKey(row.issuer);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}
export const invoicePageSize = 30;
export const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function invoicePeriod(params, today = parisDate()) {
  if (["range", "month", "year"].includes(params.period)) {
    const period = financePeriod(params, today);
    return { ...period, from: period.start };
  }
  return {
    type: "all", query: "", label: "Toutes les dates", today,
    year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)),
  };
}

export function invoiceNumber(value) {
  if (typeof value !== "string") return null;
  const formatted = value.normalize("NFKC").trim().replace(/\p{Zs}+/gu, " ");
  return formatted.length <= 80 && /^[\p{L}\p{N}][\p{L}\p{N} ._/#–—-]*$/u.test(formatted) ? formatted : null;
}

export function invoiceIssuer(value) {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim().replace(/\p{Zs}+/gu, " ");
  return name && name.length <= 120 && !/[\p{C}]/u.test(name) ? name : null;
}

export const invoiceAccount = value => typeof value === "string" && /^[0-9]{1,20}$/.test(value.trim()) ? value.trim() : null;
export const issuerKey = value => invoiceIssuer(value)?.toLowerCase() ?? "";

export function invoiceNumberKey(value) {
  return invoiceNumber(value)?.replace(/\s/gu, "").toUpperCase() ?? null;
}

export function validInvoiceDate(value, today = parisDate()) {
  return isDate(value) && value <= today;
}
