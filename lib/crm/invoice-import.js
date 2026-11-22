import { createHash } from "node:crypto";
import { invoiceAccount, invoiceIssuer, invoiceNumber, invoiceNumberKey, issuerKey, uuid, validInvoiceDate } from "./invoice-archive.mjs";
import { readInvoice } from "./invoice-pdf.mjs";
import { parseCents } from "./money.mjs";

export const invoiceMessages = {
  duplicate: "Cette facture est déjà archivée.",
  invalid: "Choisis un PDF lisible de 3 Mo maximum.",
  amount: "Confirme le montant total indiqué sur le PDF.",
  metadata: "Vérifie le numéro, la date, la société et le compte saisis.",
  number: "Le numéro saisi doit correspondre au numéro lu dans le PDF.",
  error: "Cette opération a échoué. Réessaie dans un instant.",
};

async function previouslyImported(db, owner, pdf) {
  const digest = "\\x" + createHash("sha256").update(pdf.bytes).digest("hex");
  const { data, error } = await db.from("crm_client_invoices").select("id")
    .eq("owner_id", owner).eq("pdf_digest", digest).limit(1);
  if (error) throw error;
  return Boolean(data.length);
}

export async function suggestInvoiceAccount(db, owner, issuer) {
  if (!invoiceIssuer(issuer)) return null;
  const { data, error } = await db.from("crm_invoice_account_suggestions").select("account_number")
    .eq("owner_id", owner).eq("issuer_key", issuerKey(issuer)).maybeSingle();
  if (error) throw error;
  return data?.account_number ?? null;
}

export async function inspectImportedInvoice(db, owner, form) {
  const pdf = await readInvoice(form.get("invoice"));
  if (!pdf) return { code: "invalid" };
  const { number, date, amount, issuer } = pdf;
  let duplicate = await previouslyImported(db, owner, pdf);
  if (number && issuer && !duplicate) {
    const { data, error } = await db.from("crm_client_invoices").select("id")
      .eq("owner_id", owner).eq("issuer_key", issuerKey(issuer))
      .eq("document_number_key", invoiceNumberKey(number)).limit(1);
    if (error) throw error;
    duplicate = Boolean(data.length);
  }
  const account = pdf.account ?? (pdf.accountAmbiguous ? null : await suggestInvoiceAccount(db, owner, issuer));
  return { number, date, amount, issuer, account, accountAmbiguous: pdf.accountAmbiguous, accountFromPdf: Boolean(pdf.account), duplicate };
}

export async function storeImportedInvoice(db, owner, form, linkedCustomer) {
  const declared = parseCents(form.get("document_amount"));
  if (!Number.isInteger(declared) || form.get("confirmed_cents") !== String(declared)) return "amount";

  const pdf = await readInvoice(form.get("invoice"));
  if (!pdf) return "invalid";
  const document_number = invoiceNumber(form.get("document_number")) ?? pdf.number;
  const issuer_name = invoiceIssuer(form.get("issuer_name")) ?? pdf.issuer;
  const document_date = form.get("document_date");
  const rawAccount = form.get("account_number");
  const chosenAccount = invoiceAccount(rawAccount);
  const client_id = linkedCustomer || form.get("client_id") || null;
  if (!document_number || !issuer_name || !validInvoiceDate(document_date) ||
      (rawAccount && !chosenAccount) || (client_id && (typeof client_id !== "string" || !uuid.test(client_id)))) return "metadata";
  if (pdf.number && invoiceNumberKey(pdf.number) !== invoiceNumberKey(document_number)) return "number";
  if (await previouslyImported(db, owner, pdf)) return "duplicate";

  const account_number = chosenAccount ?? pdf.account ?? (pdf.accountAmbiguous ? null : await suggestInvoiceAccount(db, owner, issuer_name));
  const { error } = await db.from("crm_client_invoices").insert({
    client_id, document_date, document_number, issuer_name, account_number, filename: pdf.filename,
    finance_declared_cents: declared, pdf: "\\x" + pdf.bytes.toString("hex"),
  });
  if (error?.code === "23505") return "duplicate";
  return error ? "error" : "saved";
}
