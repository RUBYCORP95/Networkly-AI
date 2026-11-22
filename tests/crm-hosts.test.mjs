import test from "node:test";
import assert from "node:assert/strict";
import { giftProgress, hostLinkActive } from "../lib/crm/hosts.mjs";
import { paymentLinksFromForm } from "../lib/crm/payment-links.mjs";
import { receiptEmailHtml, receiptEmailText } from "../lib/crm/order-receipt.mjs";

test("a case order link is available only during an active handover period", () => {
  const session = { kind: "case", status: "active", starts_on: "2026-11-21", ends_on: "2026-11-25" };
  assert.equal(hostLinkActive(session, "2026-11-20"), false);
  assert.equal(hostLinkActive(session, "2026-11-21"), true);
  assert.equal(hostLinkActive(session, "2026-11-25"), true);
  assert.equal(hostLinkActive(session, "2026-11-26"), false);
  assert.equal(hostLinkActive({ ...session, status: "closed" }, "2026-11-22"), false);
});

test("rewards use paid sales and preserve the history of gifts already handed over", () => {
  const gifts = [{ threshold_cents: 2500 }, { threshold_cents: 5000, delivered_at: "2026-11-22" }];
  assert.deepEqual(giftProgress(gifts, 2000).map(gift => [gift.state, gift.remaining]), [["pending", 500], ["delivered", 3000]]);
  assert.equal(giftProgress(gifts, 2500)[0].state, "available");
});

test("payment links appear in text and HTML with an order reference and exclude unsafe links", () => {
  const order = { id: "12345678-1234-4321-abcd-123456789012", status: "confirmed", payment_status: "pending",
    items: [], seller: {}, buyer: {}, details: "Bon de test", order_date: "2026-11-22", total_cents: 2400, shipping_cents: 0 };
  const form = new FormData();
  form.append("payment_label", "Wero & test");
  form.append("payment_url", "https://example.com/payment?a=1&b=2");
  const links = paymentLinksFromForm(form);
  const text = receiptEmailText(order, links);
  assert.match(text, /BC-123456781234 dans la note/);
  assert.match(text, /Wero & test\nhttps:\/\/example\.com\/payment/);
  const html = receiptEmailHtml(order, [...links, { label: "Danger", url: "javascript:alert(1)" }]);
  assert.match(html, /href="https:\/\/example\.com\/payment\?a=1&amp;b=2">Wero &amp; test<\/a>/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(receiptEmailText({ ...order, payment_status: "paid" }, links), /Moyens de paiement|dans la note/);
});
