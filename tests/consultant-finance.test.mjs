import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { financePeriod, financeReport, saleState } from "../lib/crm/finance.mjs";
import { financeExcel, financePdf } from "../lib/crm/finance-exports.js";

const today = "2026-11-22";
const period = financePeriod({}, today);
const base = { id: "00000000-0000-0000-0000-000000000001", sale_date: "2026-11-10",
  source: "order", status: "completed", payment_status: "paid", amount_cents: 12500, product_cost_cents: 6800,
  invoice_id: "linked", invoice_name: "Bon.pdf" };

test("periods keep Paris calendar dates and correctly cross year boundaries", () => {
  assert.equal(financePeriod({ period: "month", year: "2025", month: "12" }, today).to, "2025-12-31");
  assert.equal(financePeriod({ period: "quarter", quarter: "4" }, today).start, "2026-10-01");
  assert.equal(financePeriod({ period: "year" }, today).to, "2026-12-31");
  assert.equal(financePeriod({ period: ["month"], year: ["2025"] }, today).year, 2026);
});

test("custom dates default to the current month to date and keep both boundaries", () => {
  assert.equal(period.type, "range");
  assert.equal(period.label, "du 01/11/26 au 22/11/26");
  const leapDay = financePeriod({ period: "range", from: "2024-02-29", to: "2024-02-29" }, today);
  assert.equal(leapDay.start, leapDay.to);
  assert.equal(leapDay.query, "period=range&from=2024-02-29&to=2024-02-29");
  for (const [from, to] of [["2026-03-01", "2026-02-28"], ["2025-02-29", "2025-03-02"], ["2025-02-28", ""]]) {
    assert.equal(financePeriod({ period: "range", from, to }, today).invalid, true);
  }
});

test("chart groups respect custom boundaries across months and years", () => {
  const range = (from, to) => financePeriod({ period: "range", from, to }, today);
  const sale = date => ({ ...base, sale_date: date });
  const weekly = financeReport(range("2025-12-28", "2026-01-10"), [sale("2025-12-28"), sale("2026-01-10")], []);
  assert.deepEqual(weekly.buckets.map(({ key, revenue }) => [key, revenue]),
    [["2025-12-28", 12500], ["2026-01-04", 12500]]);
  const monthly = financeReport(range("2025-11-20", "2026-02-02"), [sale("2026-02-02")], []);
  assert.deepEqual(monthly.buckets.map(({ key }) => key), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.equal(monthly.buckets.at(-1).revenue, 12500);
  const yearly = financeReport(range("2000-01-01", "2026-11-22"), [sale("2026-11-22")], []);
  assert.ok(yearly.buckets.length <= 12);
  assert.equal(yearly.buckets.at(-1).revenue, 12500);
});

test("linked invoices count once and unknown costs keep the result provisional", () => {
  const sales = [base, { ...base, invoice_id: null, status: "pending", payment_status: "paid", product_cost_cents: null },
    { ...base, payment_status: "later" }, { ...base, status: "cancelled" },
    { ...base, source: "invoice", status: "archive", amount_cents: null },
    { ...base, source: "invoice", status: "excluded", amount_cents: null }];
  const entries = [{ entry_date: "2026-11-06", category: "case", amount_cents: 1700 },
    { entry_date: "2026-11-21", category: "commission", amount_cents: 3500 }];
  const { totals, buckets, result, incomplete, expensesByCategory } = financeReport(period, sales, entries);
  assert.equal(totals.revenue, 25000);
  assert.equal(totals.awaiting, 1);
  assert.equal(totals.paid, 2);
  assert.equal(totals.processed, 1);
  assert.equal(totals.archives, 1);
  assert.equal(totals.unknownCosts, 1);
  assert.equal(totals.costs, 6800);
  assert.equal(result, 20000);
  assert.equal(incomplete, true);
  assert.equal(expensesByCategory[0].total, 1700);
  assert.equal(buckets[1].revenue, 25000);
  assert.equal(saleState(sales[5]), "excluded");
});

test("both exports handle user text and keep amounts numeric in Excel", async () => {
  const report = financeReport(period, [base], [
    { entry_date: "2026-11-06", category: "equipment", label: '=1+5 <Démo> 🧾', amount_cents: 2599 },
  ]);
  const files = unzipSync(financeExcel(report));
  const ledger = strFromU8(files["xl/worksheets/sheet4.xml"]);
  assert.match(ledger, /t="inlineStr".+?=1\+5 &lt;Démo&gt; 🧾/);
  assert.match(ledger, /<c r="D2"><v>25.99<\/v><\/c>/);
  const pdf = await PDFDocument.load(await financePdf(report));
  assert.ok(pdf.getPageCount() >= 1);
});
