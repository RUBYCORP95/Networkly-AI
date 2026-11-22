import { Zip, ZipDeflate } from "fflate";
import { issuerKey } from "./invoice-archive.mjs";

function segment(value, fallback) {
  const safe = String(value ?? "").normalize("NFKC").replace(/[\p{C}<>:"/\\|?*]/gu, "_")
    .trim().replace(/^[. ]+|[. ]+$/g, "");
  const name = Array.from(safe).slice(0, 72).join("");
  return name || fallback;
}

export function invoiceZipPath(invoice) {
  const account = segment(invoice.account_number, "Compte à classer");
  const issuer = segment(invoice.issuer_name, "Société à renseigner");
  const number = segment(invoice.document_number, "Sans numéro");
  return `${account}/${issuer}/${invoice.document_date}_${number}_${invoice.id}.pdf`;
}

export function streamInvoiceZip(source) {
  const iterator = source[Symbol.asyncIterator]();
  let zip;
  const companyNames = new Map();
  return new ReadableStream({
    start(controller) {
      zip = new Zip((error, chunk, final) => {
        if (error) controller.error(error);
        else {
          controller.enqueue(chunk);
          if (final) controller.close();
        }
      });
    },
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          zip.end();
          return;
        }
        const company = JSON.stringify([value.account_number, issuerKey(value.issuer_name)]);
        if (!companyNames.has(company)) companyNames.set(company, value.issuer_name);
        const file = new ZipDeflate(invoiceZipPath({ ...value, issuer_name: companyNames.get(company) }), { level: 1 });
        zip.add(file);
        file.push(value.pdf, true);
      } catch (error) {
        zip.terminate();
        controller.error(error);
      }
    },
    async cancel() {
      zip.terminate();
      await iterator.return?.();
    },
  });
}
