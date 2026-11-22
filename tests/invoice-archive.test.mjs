import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { invoiceNumberKey, invoicePeriod, issuerKey } from "../lib/crm/invoice-archive.mjs";
import { parseInvoiceText, readInvoice } from "../lib/crm/invoice-pdf.mjs";
import { invoiceZipPath, streamInvoiceZip } from "../lib/crm/invoice-zip.mjs";

test("reads metadata from the PDF rather than its filename", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.drawText("Facture n° FA-2026/042\nDate de facture : 19/11/2026\nFournisseur : Parfums Exemple\nCompte comptable : 607100\nTotal TTC : 1 235,40 EUR",
    { x: 40, y: 770, size: 12, lineHeight: 18 });
  const fields = await readInvoice(new File([await pdf.save()], "rep-2025-99.pdf"));
  assert.equal(fields.number, "FA-2026/042");
  assert.equal(fields.date, "2026-11-19");
  assert.equal(fields.issuer, "Parfums Exemple");
  assert.equal(fields.account, "607100");
  assert.equal(fields.amount, "1235.40");
  assert.equal(invoiceNumberKey(" fa- 2026/042 "), "FA-2026/042");
  assert.equal(issuerKey(" Parfums  Exemple "), "parfums exemple");
});

test("accounts are suggested only from explicit and unambiguous labels", () => {
  assert.equal(parseInvoiceText("IBAN FR760780000\nCompte bancaire : 6070").account, null);
  const parsed = parseInvoiceText("Compte comptable : 607000\nCompte comptable : 606000\nFacture n° 20-01\nFacture n° 20-02");
  assert.equal(parsed.account, null);
  assert.equal(parsed.accountAmbiguous, true);
  assert.equal(parsed.number, null);
});

test("month and year exports and a single-day interval have inclusive bounds", () => {
  const today = "2026-11-22";
  const feb = invoicePeriod({ period: "month", month: "2", year: "2024" }, today);
  assert.equal(feb.from, "2024-02-01");
  assert.equal(feb.to, "2024-02-29");
  const year = invoicePeriod({ period: "year", year: "2025" }, today);
  assert.equal(year.from, "2025-01-01");
  assert.equal(year.to, "2025-12-31");
  const day = invoicePeriod({ period: "range", from: "2026-11-19", to: "2026-11-19" }, today);
  assert.equal(day.from, day.to);
  assert.equal(invoicePeriod({}, today).from, undefined);
});

test("streams original PDF bytes into safe nested ZIP folders", async () => {
  const base = { id: "70c93373-f6d5-4bd0-a39e-545120489e7a", account_number: "607000",
    issuer_name: "../Maison Exemple", document_date: "2026-11-20", document_number: "FA/49",
    pdf: new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]) };
  const other = { ...base, account_number: null, document_number: null };
  async function* rows() { yield base; yield other; }
  const result = unzipSync(new Uint8Array(await new Response(streamInvoiceZip(rows())).arrayBuffer()));
  assert.equal(Object.keys(result).length, 2);
  assert.match(invoiceZipPath(base), /^607000\/_Maison Exemple\/2026-11-20_FA_49_/);
  assert.deepEqual(result[invoiceZipPath(base)], base.pdf);
  assert.match(invoiceZipPath(other), /^Compte à classer\//);
});
