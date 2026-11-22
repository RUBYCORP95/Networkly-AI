import { getResolvedPDFJS } from "unpdf";
import { invoiceAccount, invoiceIssuer, invoiceNumber, invoiceNumberKey, maxInvoiceBytes, validInvoiceDate } from "./invoice-archive.mjs";
import { parseCents } from "./money.mjs";

const numberLine = /(?:num[eé]ro\s+(?:de\s+)?facture|facture\s*(?:n[°ºo.]\s*|num[eé]ro\s*|#\s*)|(?:^|\n)[ \t]*facture[ \t]*:|invoice\s*(?:number\s*|no\.?\s*|#\s*)|(?:bon\s+de\s+commande|order)\s*(?:n[°ºo.]\s*|#\s*|:\s*))/giu;
const issuerLine = /(?:^|\n)[ \t]*(?:[eé]metteur|factur[eé]\s+par|vendeur|fournisseur|seller|issued\s+by)[ \t]*:[ \t]*([^\r\n]+)/giu;
const dateLine = /(?:date\s+(?:de\s+(?:la\s+)?)?(?:facturation|facture|[eé]mission|commande)|invoice\s+date|date\s*:)/giu;
const accountLine = /(?:compte\s+comptable|accounting\s+account)(?:\s+n[°ºo.])?\s*:?\s*(\d{1,20})(?!\d)/giu;
const amountLine = /(?:total\s+(?:t\.?t\.?c\.?|[àa]\s+payer)|(?:net|montant)\s+[àa]\s+payer|amount\s+due)/giu;
const nrValue = /^\s*[:#]?\s*((?:[\p{L}]+[ \t]+)?[\p{L}\p{N}][\p{L}\p{N}._/–—-]*)/u;
const dateValue = /^\s*:?\s*(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}))(?!\d)/;
const amountValue = /^\s*:?\s*(?:€|EUR)?\s*(\d[\d .\u00a0\u202f]*[,.]\d{2})(?!\d)/i;

function uniqueValue(matches, parse, key = value => value) {
  const values = new Map();
  for (const match of matches) {
    const value = parse(match.input.slice(match.index + match[0].length));
    if (value !== null) values.set(key(value), value);
  }
  return values.size === 1 ? values.values().next().value : null;
}

export function detectInvoiceNature(text) {
  const lines = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\r?\n/);
  const content = lines.filter(line => !/^\s*(?:conditions generales|en cas de|pour toute question|voir nos conditions)\b/.test(line)).join("\n");
  const subscription = /\b(?:abonnements?|subscriptions?|forfait\s+(?:mensuel|annuel)|licence\s+(?:mensuelle|annuelle)|(?:monthly|annual)\s+(?:plan|license|licence))\b/.test(content);
  const equipment = /\b(?:achat\s+(?:d['’]\s*equipement|de\s+materiel)|materiel\s+(?:informatique|de\s+bureau)|ordinateurs?|imprimantes?|claviers?|webcams?|disques?\s+durs?|(?:ecrans?|moniteurs?)\s+\d{2}\b|hardware|laptops?|printers?|keyboards?)\b/.test(content);
  return { nature: subscription === equipment ? null : subscription ? "subscription" : "equipment",
    natureAmbiguous: subscription && equipment };
}

export function parseInvoiceText(text) {
  const number = uniqueValue(text.matchAll(numberLine), suffix => {
    const candidate = nrValue.exec(suffix)?.[1];
    return candidate && /\p{N}/u.test(candidate) ? invoiceNumber(candidate) : null;
  }, invoiceNumberKey);
  const date = uniqueValue(text.matchAll(dateLine), suffix => {
    const match = dateValue.exec(suffix);
    if (!match) return null;
    const [year, month, day] = match[1] ? match.slice(1, 4) : [match[6], match[5], match[4]];
    const value = year + "-" + month.padStart(2, "0") + "-" + day.padStart(2, "0");
    return validInvoiceDate(value) ? value : null;
  });
  const amount = uniqueValue(text.matchAll(amountLine), suffix => {
    const amount = amountValue.exec(suffix)?.[1];
    if (!amount) return null;
    const cents = parseCents(amount.slice(0, -3).replace(/\D/g, "") + amount.slice(-3));
    return Number.isInteger(cents) ? (cents / 100).toFixed(2) : null;
  });
  const issuers = [...new Set([...text.matchAll(issuerLine)].map(match => invoiceIssuer(match[1])).filter(Boolean))];
  const accounts = [...new Set([...text.matchAll(accountLine)].map(match => invoiceAccount(match[1])).filter(Boolean))];
  return { number, date, amount, ...detectInvoiceNature(text), account: accounts.length === 1 ? accounts[0] : null,
    accountAmbiguous: accounts.length > 1, issuer: issuers.length === 1 ? issuers[0] : null };
}

export async function readInvoice(file) {
  if (!(file instanceof File) || !/\.pdf$/i.test(file.name) || file.size < 6 || file.size > maxInvoiceBytes) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.toString("ascii", 0, 5) !== "%PDF-") return null;
  const filename = Array.from(file.name.replace(/[\p{C}/\\]/gu, "_").trim().replace(/\.pdf$/i, ""))
    .slice(0, 176).join("") + ".pdf";

  let loadingTask;
  try {
    const { getDocument } = await getResolvedPDFJS();
    loadingTask = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, disableFontFace: true,
      useSystemFonts: true, useWasm: false });
    const pdf = await loadingTask.promise;
    const pages = new Set([1, Math.min(2, pdf.numPages), Math.min(3, pdf.numPages), pdf.numPages]);
    const text = [];
    for (const pageNumber of pages) {
      const page = await pdf.getPage(pageNumber);
      const { items } = await page.getTextContent();
      text.push(items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join(""));
      page.cleanup();
    }
    return { bytes, filename, ...parseInvoiceText(text.join("\n")) };
  } catch {
    return null;
  } finally {
    if (loadingTask) await loadingTask.destroy().catch(() => {});
  }
}
