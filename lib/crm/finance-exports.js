import { strToU8, zipSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { categories, saleLabels, saleReference, saleState } from "./finance.mjs";
import { formatEuros } from "./money.mjs";

const euros = value => value === null ? null : value / 100;

function sheets(report) {
  const { period, totals, result, incomplete, sales, entries, buckets, expensesByCategory } = report;
  return [
    ["Synthèse", [
      ["Période", period.label], ["Chiffre d’affaires payé (EUR)", euros(totals.revenue)],
      ["Coûts des produits revendus renseignés (EUR)", euros(totals.costs)],
      ["Dépenses (EUR)", euros(totals.expenses)], ["Commissions Chogan reçues (EUR)", euros(totals.commissions)],
      [incomplete ? "Résultat provisoire (EUR)" : "Résultat estimé (EUR)", euros(result)],
      ["Bons de commande", totals.orders], ["Factures liées déjà comptées avec leur bon", totals.linked],
      ["Ventes en attente", totals.awaiting], ["Ventes payées", totals.paid],
      ["Bons traités et payés", totals.processed], ["PDF importés à rapprocher", totals.archives],
      ["Ventes payées sans montant", totals.unknownAmounts], ["Ventes payées sans coût", totals.unknownCosts],
      ["Le chiffre d’affaires est rattaché à la date du bon ou de la facture indépendante."],
      ["Résultat = chiffre d’affaires payé + commissions - dépenses - coûts renseignés."],
    ]],
    ["Évolution", [
      ["Début", "Chiffre d’affaires (EUR)", "Dépenses (EUR)", "Commissions (EUR)"],
      ...buckets.map(row => [row.key, euros(row.revenue), euros(row.expenses), euros(row.commissions)]),
    ]],
    ["Ventes", [
      ["Date", "Référence", "Source", "Statut", "Montant (EUR)", "Coût (EUR)", "Document"],
      ...sales.map(row => [row.sale_date, saleReference(row), row.source === "order" ? "Bon de commande" : "PDF importé",
        saleLabels[saleState(row)], euros(row.amount_cents), euros(row.product_cost_cents), row.invoice_name]),
    ]],
    ["Registre", [
      ["Date", "Catégorie", "Libellé", "Montant (EUR)", "Justificatif"],
      ...entries.map(row => [row.entry_date, categories[row.category], row.label, euros(row.amount_cents), row.receipt_name]),
    ]],
    ["Dépenses par catégorie", [["Catégorie", "Montant (EUR)"], ...expensesByCategory.map(row => [row.label, euros(row.total)])]],
  ];
}

const xml = value => String(value).replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "")
  .replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
const mainNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const docNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const packageNs = "http://schemas.openxmlformats.org/package/2006/relationships";

export function financeExcel(report) {
  const records = sheets(report);
  const worksheets = records.map((_, index) => "worksheets/sheet" + (index + 1) + ".xml");
  const files = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      ${worksheets.map(path => `<Override PartName="/xl/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
      </Types>`,
    "_rels/.rels": `<Relationships xmlns="${packageNs}"><Relationship Id="rId1" Type="${docNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${mainNs}" xmlns:r="${docNs}"><sheets>${records.map(([name], index) =>
      `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${packageNs}">${worksheets.map((path, index) =>
      `<Relationship Id="rId${index + 1}" Type="${docNs}/worksheet" Target="${path}"/>`).join("")}</Relationships>`,
  };
  records.forEach(([, rows], index) => {
    const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, column) => {
      if (value == null) return "";
      const coordinate = String.fromCharCode(65 + column) + (rowIndex + 1);
      return typeof value === "number"
        ? `<c r="${coordinate}"><v>${value}</v></c>`
        : `<c r="${coordinate}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("")}</row>`).join("");
    files["xl/" + worksheets[index]] = `<worksheet xmlns="${mainNs}"><cols>
      <col min="1" max="1" width="${index === 0 ? 60 : 23}" customWidth="1"/>
      <col min="2" max="7" width="26" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`;
  });
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, source]) => [path, strToU8(source)])));
}

export async function financePdf(report) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("TESAMI · Analytique & Finances");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(.29, .19, .49);
  const sanitized = value => Array.from(String(value).replace(/[\u202f\u00a0\s]+/gu, " "), char => {
    try { regular.encodeText(char); return char; } catch { return "?"; }
  }).join("");
  let page, y;
  function start() {
    page = pdf.addPage([595.28, 841.89]);
    y = 798;
    line("TESAMI · Analytique & Finances", { font: bold, size: 20 });
    line("Période : " + report.period.label);
    y -= 16;
  }
  function line(value, { font = regular, size = 10 } = {}) {
    const text = sanitized(value);
    const wrapped = [];
    let buffer = "";
    for (const char of text) {
      if (font.widthOfTextAtSize(buffer + char, size) > 510) {
        const space = buffer.lastIndexOf(" ");
        if (space > 0) { wrapped.push(buffer.slice(0, space)); buffer = buffer.slice(space + 1); }
        else { wrapped.push(buffer); buffer = ""; }
      }
      buffer += char;
    }
    wrapped.push(buffer);
    for (const part of wrapped) {
      if (y < 44) start();
      page.drawText(part, { x: 42, y, size, font, color: purple });
      y -= size + 6;
    }
  }
  start();
  const [summary, , sales, ledger] = sheets(report);
  for (const [label, value] of summary[1].slice(1)) {
    line(value == null ? label : label.replace(" (EUR)", "") + " : " +
      (label.includes("(EUR)") ? formatEuros(Math.round(value * 100)) : value));
  }
  for (const [title, table] of [sales, ledger]) {
    y -= 16;
    if (y < 76) start();
    line(title, { font: bold, size: 15 });
    for (const [date, name, detail, fourth, fifth, sixth] of table.slice(1)) {
      if (title === "Ventes") {
        const amount = fifth === null ? "Montant inconnu" : formatEuros(Math.round(fifth * 100));
        const cost = sixth === null ? "Coût inconnu" : "coût " + formatEuros(Math.round(sixth * 100));
        line([date, name, detail, fourth, amount, cost].join(" · "));
      } else {
        line([date, name, detail, formatEuros(Math.round(fourth * 100))].join(" · "));
      }
    }
    if (table.length === 1) line("Aucune donnée sur cette période.");
  }
  return pdf.save();
}
