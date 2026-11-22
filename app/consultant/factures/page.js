import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { requireConsultant } from "../../../lib/auth/consultant";
import { formatDate } from "../../../lib/crm/dates.mjs";
import { invoiceApi, invoiceNatures, invoicePageSize, invoicePath, invoicePeriod, issuerKey } from "../../../lib/crm/invoice-archive.mjs";
import { invoiceCustomers, listInvoices } from "../../../lib/crm/invoice-data";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { createServerSupabase } from "../../../lib/supabase/server";
import shared from "../consultant.module.css";
import BatchInvoiceUpload, { InvoiceClassification } from "./BatchInvoiceUpload";
import InvoiceFilters from "./InvoiceFilters";
import styles from "./invoices.module.css";

export const metadata = { title: "Toutes mes factures · TESAMI" };

function folders(invoices) {
  const accounts = new Map();
  for (const invoice of invoices) {
    if (!accounts.has(invoice.account_number)) accounts.set(invoice.account_number, new Map());
    const companies = accounts.get(invoice.account_number);
    const key = issuerKey(invoice.issuer_name);
    if (!companies.has(key)) companies.set(key, { name: invoice.issuer_name, invoices: [] });
    companies.get(key).invoices.push(invoice);
  }
  return accounts;
}

function InvoiceFolders({ invoices, customers }) {
  return [...folders(invoices)].map(([account, companies]) => <details key={account ?? ""} open className={styles.account}>
    <summary>{account ? "Compte " + account : "Compte à classer"}</summary>
    {[...companies].map(([key, company]) => <details open key={key} className={styles.company}>
      <summary>{company.name ?? "Société à renseigner"}</summary>
      <ul className={styles.documents}>
        {company.invoices.map(invoice => <li key={invoice.id}>
          <div className={styles.document}>
            <div>
              <strong>{invoice.document_number ?? "Sans numéro"}</strong>
              <small>{formatDate(invoice.document_date)}{invoice.order_id && " · Bon de commande"}
                {customers.has(invoice.client_id) && " · " + customers.get(invoice.client_id)}
                {invoice.document_nature && " · " + invoiceNatures[invoice.document_nature]}</small>
            </div>
            {invoice.finance_declared_cents !== null && <strong>{formatEuros(invoice.finance_declared_cents)}</strong>}
            <a className={shared.crmAction} aria-label={"Télécharger " + invoice.filename} href={invoiceApi + "/" + invoice.id} download>
              <FileText size={16} aria-hidden="true" /> PDF
            </a>
          </div>
          <InvoiceClassification invoice={invoice} />
        </li>)}
      </ul>
    </details>)}
  </details>);
}

function pageUrl(period, page) {
  const params = new URLSearchParams(period.query);
  if (page > 1) params.set("page", page);
  return invoicePath + (params.size ? "?" + params : "");
}

export default async function AllInvoices({ searchParams }) {
  const params = await searchParams;
  const period = invoicePeriod(params);
  const page = typeof params.page === "string" && /^[1-9]\d{0,5}$/.test(params.page) ? Number(params.page) : 1;
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return null;
  const owner = access.user.id;

  const [list, clients] = await Promise.all([
    listInvoices(db, owner, period, page),
    invoiceCustomers(db, owner).catch(() => null),
  ]);
  const query = new URLSearchParams(period.query);
  query.set("format", "zip");
  const customerNames = new Map((clients ?? []).map(client => [client.id, client.name]));

  return <main className={shared.page + " " + styles.page}>
    <Link href="/consultant">← Espace Consultant</Link>
    <header className={styles.heading}>
      <h1>Toutes mes factures</h1>
      {list.count > 0 && !period.invalid && <a className={shared.crmAction} href={invoiceApi + "?" + query} download>
        <Download size={17} aria-hidden="true" /> Exporter en ZIP
      </a>}
    </header>

    <section className={styles.panel}>
      <h2>Importer des factures</h2>
      <BatchInvoiceUpload customers={clients ?? []} today={period.today} />
    </section>

    <section className={styles.panel}>
      <h2>Factures archivées</h2>
      <InvoiceFilters key={period.query} period={period} />
      {period.invalid && <p role="alert">Choisis une date de fin égale ou postérieure à la date de début.</p>}
      {list.error ? <p role="alert">Les factures sont temporairement indisponibles.</p> :
        <>
          <p className={styles.muted}>{period.label} · {list.count} facture{list.count === 1 ? "" : "s"}</p>
          {list.data.length ? <InvoiceFolders invoices={list.data} customers={customerNames} /> : <p>Aucune facture à afficher.</p>}
          {(page > 1 || page * invoicePageSize < list.count) && <nav className={styles.pagination} aria-label="Pages des factures">
            {page > 1 && <Link href={pageUrl(period, page - 1)}>Page précédente</Link>}
            {page * invoicePageSize < list.count && <Link href={pageUrl(period, page + 1)}>Page suivante</Link>}
          </nav>}
        </>}
    </section>
  </main>;
}
