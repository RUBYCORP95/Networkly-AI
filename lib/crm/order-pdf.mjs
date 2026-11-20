import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { receiptNumber, receiptText } from "./order-receipt.mjs";

export async function makeOrderPdf(order) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Bon de commande " + receiptNumber(order.id));
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported = new Set(regular.getCharacterSet());
  const margin = 48;
  const width = 595;
  const height = 842;
  let page;
  let y;

  function newPage() {
    page = pdf.addPage([width, height]);
    page.drawText("TESAMI", { x: margin, y: height - margin, size: 11, font: bold, color: rgb(0.34, 0.20, 0.66) });
    y = height - margin - 30;
  }

  newPage();
  for (const [index, line] of receiptText(order).split("\n").entries()) {
    const font = index === 0 || line.startsWith("Total :") ? bold : regular;
    const size = index === 0 ? 20 : 11;
    const clean = [...line.normalize("NFC").replace(/[\u00a0\u202f]/g, " ").replace(/−/g, "-")]
      .map(char => supported.has(char.codePointAt(0)) ? char : "?").join("");
    const chunks = [];
    let chunk = "";
    for (const word of clean.split(/\s+/)) {
      const candidate = chunk ? chunk + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) > width - margin * 2 && chunk) {
        chunks.push(chunk);
        chunk = word;
      } else {
        chunk = candidate;
      }
      if (font.widthOfTextAtSize(chunk, size) > width - margin * 2) {
        let fragment = "";
        for (const char of chunk) {
          if (font.widthOfTextAtSize(fragment + char, size) > width - margin * 2) {
            chunks.push(fragment);
            fragment = "";
          }
          fragment += char;
        }
        chunk = fragment;
      }
    }
    chunks.push(chunk);
    for (const text of chunks) {
      if (y < margin) newPage();
      if (text) page.drawText(text, { x: margin, y, size, font, color: rgb(0.15, 0.12, 0.22) });
      y -= text ? size + 5 : 8;
    }
  }
  return pdf.save();
}
