import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { receiptNumber, receiptDate, paymentStatuses, orderStatuses, sellerFields, giftLine } from "./order-receipt.mjs";
import { savedOrderTotals, lineTotal, discountLabel, discountCents } from "./order-pricing.mjs";
import { formatEuros } from "./money.mjs";

export async function makeOrderPdf(order) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Bon de commande " + receiptNumber(order));
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const chars = new Set(normal.getCharacterSet());
  const W = 595, H = 842, M = 40, inner = W - 2 * M;
  const violet = rgb(.337, .204, .659), ink = rgb(.14, .11, .23);
  const muted = rgb(.40, .37, .47), pale = rgb(.965, .951, .99);
  const border = rgb(.87, .84, .93), white = rgb(1, 1, 1);
  let page, y, pageNo = 0;
  const clean = value => [...String(value ?? "").normalize("NFC").replace(/[\u00a0\u202f]/g, " ").replace(/−/g, "-")].map(c => chars.has(c.codePointAt(0)) ? c : "?").join("");
  function text(value, x, top, size = 10, font = normal, color = ink) {
    page.drawText(clean(value), { x, y: H - top - size, size, font, color });
  }
  function fit(value, max, size = 10, font = normal) {
    const words = clean(value).split(/\s+/), out = [];
    let row = "";
    for (const word of words) {
      const next = row ? row + " " + word : word;
      if (font.widthOfTextAtSize(next, size) <= max) { row = next; continue; }
      if (row) { out.push(row); row = ""; }
      for (const ch of word) {
        if (font.widthOfTextAtSize(row + ch, size) > max && row) { out.push(row); row = ""; }
        row += ch;
      }
    }
    if (row) out.push(row);
    return out.length ? out : [""];
  }
  function block(value, x, top, max, size = 10, font = normal, color = ink, leading = 14) {
    const lines = String(value ?? "").split("\n").flatMap(v => fit(v, max, size, font));
    lines.forEach((line, i) => text(line, x, top + i * leading, size, font, color));
    return lines.length * leading;
  }
  function rect(x, top, w, h, fill = white, stroke = border) {
    page.drawRectangle({ x, y: H - top - h, width: w, height: h, color: fill, borderColor: stroke, borderWidth: .7 });
  }
  function line(x1, top, x2, color = border) {
    page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness: .7, color });
  }
  function start() {
    page = pdf.addPage([W, H]); pageNo++;
    page.drawRectangle({ x: 0, y: H - 14, width: W, height: 14, color: violet });
    text("CHOGAN", M, 30, 16, bold, violet);
    text("BON DE COMMANDE", W - M - 135, 35, 10, bold, muted);
    line(M, 62, W - M);
    y = 80;
  }
  function ensure(h) { if (y + h > H - 65) { footer(); start(); } }
  function footer() {
    line(M, H - 47, W - M);
    text("CHOGAN  |  " + receiptNumber(order), M, H - 39, 8, normal, muted);
    text("Page " + pageNo, W - M - 36, H - 39, 8, normal, muted);
  }
  start();
  text(receiptNumber(order), M, y, 19, bold);
  text(receiptDate(order), W - M - 115, y + 5, 10, normal, muted);
  y += 40;
  const seller = order.seller || {}, buyer = order.buyer || {};
  const sellerLines = sellerFields.map(([key]) => seller[key]).filter(Boolean).flatMap(v => String(v).split("\n"));
  const buyerLines = [buyer.name, buyer.email, buyer.phone, buyer.address].filter(Boolean);
  const boxW = (inner - 12) / 2;
  const sellerWrapped = sellerLines.flatMap(v => fit(v, boxW - 24, 9));
  const buyerWrapped = buyerLines.flatMap(v => String(v).split("\n").flatMap(line => fit(line, boxW - 24, 9)));
  const boxH = Math.max(78, 42 + 13 * Math.max(sellerWrapped.length, buyerWrapped.length));
  rect(M, y, boxW, boxH, pale);
  rect(M + boxW + 12, y, boxW, boxH, pale);
  text("CONSULTANT", M + 12, y + 11, 9, bold, violet);
  text("CLIENT", M + boxW + 24, y + 11, 9, bold, violet);
  sellerWrapped.forEach((s, i) => text(s, M + 12, y + 30 + 13 * i, 9));
  buyerWrapped.forEach((s, i) => text(s, M + boxW + 24, y + 30 + 13 * i, 9));
  y += boxH + 24;
  const cols = [M, M + 195, M + 256, M + 290, M + 362, M + 435, W - M];
  function header() {
    rect(M, y, inner, 29, violet, violet);
    ["Produit", "Réf.", "Qté", "Prix unit.", "Remise", "Total"].forEach((label, i) => text(label, cols[i] + 7, y + 8, 8, bold, white));
    y += 29;
  }
  ensure(70); header();
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length && order.details) {
    const lines = fit(order.details, inner - 18, 9);
    ensure(lines.length * 14 + 16);
    lines.forEach((s, i) => text(s, M + 8, y + 8 + i * 14, 9));
    y += lines.length * 14 + 16;
    line(M, y, W - M);
  }
  for (const item of items) {
    const product = fit([item.title, item.format].filter(Boolean).join(" - "), cols[1] - cols[0] - 14, 9);
    const ref = fit(item.reference || "-", cols[2] - cols[1] - 12, 8);
    const gross = (item.quantity || 0) * (item.unit_cents || 0);
    const discount = item.discount ? discountLabel(item.discount) : "-";
    const disc = fit(discount, cols[5] - cols[4] - 12, 8);
    const total = lineTotal(item);
    const h = Math.max(39, 17 + 13 * Math.max(product.length, ref.length, disc.length) + (total === 0 ? 13 : 0));
    if (y + h > H - 170) { footer(); start(); header(); }
    rect(M, y, inner, h, pageNo % 2 ? white : pale);
    product.forEach((s, i) => text(s, cols[0] + 7, y + 8 + i * 13, 9, i === 0 ? bold : normal));
    ref.forEach((s, i) => text(s, cols[1] + 7, y + 8 + i * 13, 8));
    text(item.quantity, cols[2] + 7, y + 8, 9);
    text(formatEuros(item.unit_cents), cols[3] + 7, y + 8, 8);
    disc.forEach((s, i) => text(s, cols[4] + 7, y + 8 + i * 13, 8));
    text(formatEuros(total), cols[5] + 7, y + 8, 8, bold);
    if (total === 0) text("OFFERT", cols[0] + 7, y + h - 17, 8, bold, violet);
    y += h;
  }
  const gift = giftLine(order);
  if (gift) {
    y += 12;
    const h = 13 * fit(gift, inner - 24, 9, bold).length + 18;
    ensure(h);
    rect(M, y, inner, h, pale);
    block(gift, M + 12, y + 8, inner - 24, 9, bold, violet, 13);
    y += h;
  }
  y += 22;
  ensure(175);
  const { subtotal, savings, total } = savedOrderTotals(order);
  const summaryX = M + 235, summaryW = inner - 235;
  const summaryRows = [
    ["Sous-total produits", subtotal === null ? "À confirmer" : formatEuros(subtotal)],
    ...(order.order_discount ? [["Remise globale (" + discountLabel(order.order_discount) + ")", "-" + formatEuros(savings)]] : []),
    ["Livraison", formatEuros(order.shipping_cents || 0)],
  ];
  const summaryH = summaryRows.length * 25 + 44;
  rect(summaryX, y, summaryW, summaryH, pale);
  summaryRows.forEach(([label, value], i) => {
    text(label, summaryX + 10, y + 9 + i * 25, 9);
    const size = 9, tw = normal.widthOfTextAtSize(clean(value), size);
    text(value, summaryX + summaryW - 10 - tw, y + 9 + i * 25, size);
  });
  const ty = y + summaryRows.length * 25;
  page.drawRectangle({ x: summaryX, y: H - ty - 44, width: summaryW, height: 44, color: violet });
  text("TOTAL À PAYER", summaryX + 10, ty + 13, 10, bold, white);
  const totalText = total === null ? "À confirmer" : formatEuros(total);
  text(totalText, summaryX + summaryW - 10 - bold.widthOfTextAtSize(clean(totalText), 12), ty + 11, 12, bold, white);
  y += summaryH + 22;
  ensure(52);
  text("Statut de la commande : " + (new Map(orderStatuses).get(order.status) || "En attente"), M, y, 10, bold);
  text("Paiement : " + (new Map(paymentStatuses).get(order.payment_status) || "En attente"), M, y + 20, 10);
  footer();
  return pdf.save();
}
