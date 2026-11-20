import assert from "node:assert/strict";
import test from "node:test";
import { lineTotal, orderTotals, readDiscount, savedOrderTotals } from "../lib/crm/order-pricing.mjs";
import { receiptText } from "../lib/crm/order-receipt.mjs";
import { makeOrderPdf } from "../lib/crm/order-pdf.mjs";

test("prices, fixed discounts per line, fractional percentages and rounding", () => {
  assert.equal(lineTotal({ unit_cents: 0, quantity: 2 }), 0);
  assert.equal(lineTotal({ unit_cents: 3500, quantity: 2, discount: readDiscount("euros", "5,25") }), 6475);
  assert.equal(lineTotal({ unit_cents: 999, quantity: 1, discount: readDiscount("percent", "12.5") }), 874);
  assert.equal(lineTotal({ unit_cents: 999, quantity: 1, discount: readDiscount("percent", "100") }), 0);
  assert.throws(() => readDiscount("percent", "100.01"));
  assert.throws(() => readDiscount("euros", "-2"));
});

test("order discounts apply after line discounts and leave shipping payable", () => {
  assert.deepEqual(orderTotals(2800, readDiscount("percent", "10"), 500), { savings: 280, net: 2520, total: 3020 });
  assert.deepEqual(orderTotals(2800, readDiscount("euros", "30"), 500), { savings: 2800, net: 0, total: 500 });
  assert.deepEqual(savedOrderTotals({ total_cents: null, shipping_cents: 500 }), { subtotal: null, savings: 0, total: null });
  assert.deepEqual(savedOrderTotals({ total_cents: 3500, shipping_cents: 500 }), { subtotal: 3500, savings: 0, total: 4000 });
});

test("a saved order round trips with free items and both discounts in receipt and PDF", async () => {
  const order = JSON.parse(JSON.stringify({
    id: "11111111-1111-1111-1111-111111111111", created_at: "2026-11-20T10:00:00Z",
    buyer: { name: "Élodie" }, seller: { name: "Raphaël" }, shipping_cents: 500, total_cents: 2520,
    items: [
      { id: "1", title: "Parfum offert", unit_cents: 0, quantity: 1 },
      { id: "2", title: "Parfum en promotion", unit_cents: 3500, quantity: 1, discount: readDiscount("euros", "7") },
    ],
    order_discount: { ...readDiscount("percent", "10"), applied_cents: 280 },
  }));
  const text = receiptText(order).replace(/[\u00a0\u202f]/g, " ");
  assert.match(text, /0,00 € · Offert/);
  assert.match(text, /Remise 7,00 € \(−7,00 €\) · 28,00 €/);
  assert.match(text, /Remise globale 10 % : −2,80 €/);
  assert.match(text, /Total : 30,20 €/);
  const pdf = await makeOrderPdf(order);
  assert.match(Buffer.from(pdf).subarray(0, 8).toString(), /^%PDF-/);
});
