import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatDate } from "./dates.mjs";
import { formatEuros } from "./money.mjs";
import { paymentStatuses, receiptNumber } from "./order-receipt.mjs";

function productLabel(item) {
  return [item.reference, item.title, item.format].filter(Boolean).join(" · ");
}

export function meetingDeliveryItems(orders) {
  const items = new Map();
  for (const order of orders) {
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items) {
      const label = productLabel(item);
      if (!label || !Number.isSafeInteger(item.quantity) || item.quantity < 1) continue;
      const key = JSON.stringify([item.reference || "", item.title || "", item.format || ""]);
      const quantity = (items.get(key)?.quantity ?? 0) + item.quantity;
      items.set(key, { label, quantity });
    }
  }
  return [...items.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export async function makeMeetingDeliveryPdf(session, orders) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Bon de livraison groupée");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(normal.getCharacterSet());
  const clean = value => [...String(value ?? "").normalize("NFC").replace(/\s/g, " ")]
    .map(character => supported.has(character.codePointAt(0)) ? character : "?").join("");
  let page, y;

  function addPage() {
    page = pdf.addPage([595, 842]);
    page.drawText("CHOGAN  |  BON DE LIVRAISON GROUPÉE", { x: 42, y: 790, size: 16, font: bold });
    page.drawText("Page " + pdf.getPageCount(), { x: 510, y: 35, size: 9, font: normal });
    y = 758;
  }

  function line(value, font = normal, size = 11) {
    let row = "";
    for (const character of clean(value)) {
      if (font.widthOfTextAtSize(row + character, size) > 510) {
        if (y < 60) addPage();
        page.drawText(row, { x: 42, y, size, font });
        y -= size + 5;
        row = "";
      }
      row += character;
    }
    if (y < 60) addPage();
    page.drawText(row, { x: 42, y, size, font });
    y -= size + 5;
  }

  addPage();
  line("Réunion du " + formatDate(session.starts_on), bold);
  line("Livraison chez " + session.host_name, bold);
  for (const addressLine of (session.delivery_address || session.venue).split(/\r?\n/)) line(addressLine);
  const paid = orders.filter(order => order.payment_status === "paid").length;
  const later = orders.filter(order => order.payment_status === "later").length;
  line(orders.length + " bon(s) rattaché(s) · " + paid + " payé(s) · " + later + " à payer plus tard", normal, 10);
  y -= 14;
  line("Quantités à préparer", bold, 13);
  const grouped = meetingDeliveryItems(orders);
  for (const item of grouped) line(item.quantity + " × " + item.label);
  if (!grouped.length) line("Aucune ligne produit détaillée.");
  y -= 14;
  line("Détail par bon de commande", bold, 13);
  const payments = new Map(paymentStatuses);
  for (const order of orders) {
    const details = Array.isArray(order.items) ? order.items : [];
    if (y < 100) addPage();
    const amount = order.total_cents == null ? null : formatEuros(order.total_cents + order.shipping_cents);
    line([receiptNumber(order.id), order.buyer?.name, payments.get(order.payment_status), amount].filter(Boolean).join(" · "), bold);
    if (!details.length) {
      line("Bon sans lignes détaillées. Consulter le bon d’origine.");
    } else {
      for (const item of details) line(item.quantity + " × " + productLabel(item));
    }
    y -= 6;
  }
  return pdf.save();
}
