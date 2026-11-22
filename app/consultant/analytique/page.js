import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { formatDate } from "../../../lib/crm/dates.mjs";
import { loadFinance } from "../../../lib/crm/finance-data";
import { categories, financeApi, financePath, financePeriod, saleLabels, saleReference, saleState } from "../../../lib/crm/finance.mjs";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { createServerSupabase } from "../../../lib/supabase/server";
import shell from "../consultant.module.css";
import EntryForm, { PeriodFields } from "./EntryForm";
import Filters from "./Filters";
import styles from "./finance.module.css";

export const metadata = { title: "Analytique & Finances · TESAMI" };

const notices = {
  saved: "Enregistrement effectué.",
  outside: "Écriture enregistrée. Sa date se situe en dehors de la période affichée.",
  deleted: "Écriture supprimée.",
  invalid: "Vérifie les informations et les confirmations saisies.",
  file: "Choisis un justificatif PDF, PNG ou JPEG de 3 Mo maximum.",
  duplicate: "Ce numéro de facture figure déjà dans tes ventes.",
  error: "L’enregistrement a échoué. Réessaie dans un instant.",
};

const amount = value => value == null ? "À renseigner" : formatEuros(value);

function Summary({ report }) {
  const { totals: t, result, incomplete } = report;
  const metrics = [
    ["Chiffre d’affaires payé", formatEuros(t.revenue), "Ventes marquées payées"],
    ["Dépenses", formatEuros(t.expenses), "Achats et frais saisis"],
    ["Commissions Chogan", formatEuros(t.commissions), "Versements reçus saisis"],
    ["Coûts des produits revendus", t.knownCosts || !t.paid ? formatEuros(t.costs) : "À renseigner",
      t.unknownCosts ? `${t.unknownCosts} vente(s) payée(s) sans coût` : "Coûts d’achat renseignés"],
    [incomplete ? "Résultat provisoire" : "Résultat estimé", formatEuros(result),
      "Ventes payées + commissions − dépenses − coûts renseignés"],
  ];
  return <>
    <dl className={styles.metrics}>{metrics.map(([label, value, detail]) => <div key={label}>
      <dt>{label}</dt><dd>{value}</dd><dd>{detail}</dd>
    </div>)}</dl>
    {incomplete && <p className={styles.info}>
      {t.unknownCosts > 0 && `${t.unknownCosts} vente(s) payée(s) sans coût d’achat. `}
      {t.unknownAmounts > 0 && `${t.unknownAmounts} vente(s) payée(s) sans montant. `}
      {t.archives > 0 && `${t.archives} PDF importé(s) à rapprocher. `}
      Le résultat utilise les montants renseignés sur la période.
    </p>}
  </>;
}

const series = [["revenue", "Ventes payées"], ["expenses", "Dépenses"], ["commissions", "Commissions"]];
function Chart({ report }) {
  const max = Math.max(1, ...report.buckets.flatMap(row => series.map(([key]) => row[key])));
  return <section className={styles.panel} aria-labelledby="finance-chart">
    <h2 id="finance-chart">Évolution sur la période</h2>
    <p className={styles.caption}>{report.period.type === "month" ? "Montants par tranche de 7 jours" : "Montants par mois"}</p>
    <ul className={styles.legend}>{series.map(([key, label]) =>
      <li key={key}><span className={styles[key]} aria-hidden="true" />{label}</li>)}</ul>
    <div className={styles.chartScroll}>
      <div className={styles.chart} style={{ "--groups": report.buckets.length }} aria-hidden="true">
        {report.buckets.map(row => <div key={row.key} className={styles.group}>
          <div className={styles.bars}>{series.map(([key, label]) => <span key={key} className={styles[key]}
            style={{ height: (row[key] / max * 100) + "%" }} title={label + " · " + formatEuros(row[key])} />)}</div>
          <small>{row.label}</small>
        </div>)}
      </div>
    </div>
    <details className={styles.dataTable}>
      <summary>Voir les chiffres du graphique</summary>
      <div className={styles.chartScroll} tabIndex={0} role="region" aria-label="Chiffres du graphique">
        <table><thead><tr><th>Début</th>{series.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
          <tbody>{report.buckets.map(row => <tr key={row.key}><th scope="row">{row.key}</th>
            {series.map(([key]) => <td key={key}>{formatEuros(row[key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  </section>;
}

function ExpenseChart({ report }) {
  const max = Math.max(1, ...report.expensesByCategory.map(row => row.total));
  return <section className={styles.panel}>
    <h2>Dépenses par catégorie</h2>
    <ul className={styles.expenseBars}>{report.expensesByCategory.map(row => <li key={row.key}>
      <div><span>{row.label}</span><strong>{formatEuros(row.total)}</strong></div>
      <div className={styles.track} aria-hidden="true"><span style={{ width: (row.total / max * 100) + "%" }} /></div>
    </li>)}</ul>
  </section>;
}

function SaleForm({ sale, period }) {
  const independent = sale.source === "invoice";
  const value = sale.amount_cents ?? sale.declared_cents;
  return <details className={styles.edit}>
    <summary>{independent ? "Rapprocher le PDF" : "Renseigner le coût d’achat"}</summary>
    <form action={financeApi} method="post" className={styles.fields}>
      <PeriodFields period={period} />
      <input name="id" type="hidden" value={sale.id} />
      {independent && <>
        <label>Numéro inscrit sur la facture<input name="reference" maxLength={80} required defaultValue={sale.invoice_reference ?? ""} /></label>
        <label>Montant total (€)<input name="amount" inputMode="decimal" maxLength={9} required
          defaultValue={value == null ? "" : (value / 100).toFixed(2)} /></label>
        <label>Paiement<select name="payment" defaultValue={sale.payment_status ?? "pending"}>
          <option value="pending">En attente</option><option value="paid">Payé</option>
        </select></label>
        <label className={styles.check}><input name="distinct" type="checkbox" value="yes" required />
          Je confirme le montant et que cette vente ne figure dans aucun bon ni dans une autre facture comptabilisée.
        </label>
      </>}
      <label>Coût total d’achat des produits (€)<input name="cost" inputMode="decimal" maxLength={9}
        defaultValue={sale.product_cost_cents == null ? "" : (sale.product_cost_cents / 100).toFixed(2)} /></label>
      <div className={styles.actions}>
        <button name="operation" value={independent ? "invoice" : "cost"}>Enregistrer</button>
        {independent && sale.status !== "excluded" && <button className={styles.secondary} name="operation" value="archive" formNoValidate>
          Archiver hors totaux
        </button>}
      </div>
    </form>
  </details>;
}

function Sales({ report }) {
  const { totals, sales, period } = report;
  return <section className={styles.panel}>
    <h2>Ventes et documents</h2>
    <dl className={styles.stats}>{[
      ["Bons", totals.orders], ["En attente", totals.awaiting], ["Payés", totals.paid],
      ["Traités et payés", totals.processed], ["Factures liées", totals.linked], ["PDF à rapprocher", totals.archives],
    ].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <p className={styles.caption}>Un bon et sa facture liée forment une seule vente. Les ventes payées sont rattachées à la date du bon ou de la facture indépendante. Les commandes annulées et les PDF à rapprocher ou écartés restent hors totaux.</p>
    {sales.length === 0 ? <p>Aucun document sur cette période.</p> : <ul className={styles.rows}>
      {sales.map(sale => {
        const state = saleState(sale);
        return <li key={sale.source + sale.id}>
          <div className={styles.row}>
            <div><strong>{saleReference(sale)}</strong>
              <small>{formatDate(sale.sale_date)} · {sale.source === "order" ? "Bon de commande" : "PDF importé"}</small></div>
            <span className={styles.badge} data-state={state}>{saleLabels[state]}</span>
            <div><strong>{amount(sale.amount_cents)}</strong>
              <small>{sale.status === "archive" && sale.declared_cents != null
                ? "Confirmé à l’import · " + amount(sale.declared_cents)
                : "Coût des produits · " + amount(sale.product_cost_cents)}</small></div>
          </div>
          <div className={styles.actions}>
            {sale.source === "order" && <Link href={`/consultant/clients?client=${sale.client_id}&view=history`}>Bons du client</Link>}
            {sale.invoice_id && <a href={`/api/consultant/invoices/${sale.invoice_id}`} download>
              <FileText size={15} aria-hidden="true" />{sale.source === "order" ? "Facture liée" : "PDF d’origine"}
            </a>}
          </div>
          {state !== "cancelled" && <SaleForm sale={sale} period={period} />}
        </li>;
      })}
    </ul>}
  </section>;
}

function Ledger({ report, commission = false }) {
  const rows = report.entries.filter(entry => (entry.category === "commission") === commission);
  return <section className={styles.panel}>
    <h2>{commission ? "Commissions Chogan reçues" : "Dépenses"}</h2>
    <details className={styles.edit}>
      <summary>{commission ? "Ajouter un versement" : "Ajouter une dépense"}</summary>
      <EntryForm period={report.period} commission={commission} />
    </details>
    {rows.length === 0 ? <p>Aucune écriture sur cette période.</p> : <ul className={styles.rows}>
      {rows.map(entry => <li key={entry.id}>
        <div className={styles.row}>
          <div><strong>{entry.label}</strong><small>{formatDate(entry.entry_date)} · {categories[entry.category]}</small></div>
          <strong>{formatEuros(entry.amount_cents)}</strong>
        </div>
        {entry.receipt_name && <div className={styles.actions}><a href={financeApi + "?receipt=" + entry.id} download>
          <FileText size={15} aria-hidden="true" /> {entry.receipt_name}
        </a></div>}
        <details className={styles.edit}><summary>Modifier</summary>
          <EntryForm period={report.period} entry={entry} commission={commission} />
        </details>
      </li>)}
    </ul>}
  </section>;
}

export default async function FinancePage({ searchParams }) {
  const params = await searchParams;
  const period = financePeriod(params);
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (access.status === 401) redirect("/login?next=" + financePath);
  if (!access.ok) redirect("/");
  let report;
  try {
    report = await loadFinance(db, access.user.id, period);
  } catch (error) {
    console.error("Finance dashboard:", error.message);
  }
  const notice = typeof params.result === "string" && Object.hasOwn(notices, params.result) ? notices[params.result] : null;

  return <main className={shell.page + " " + styles.finance}>
    <Link href="/consultant">← Espace Consultant</Link>
    <header className={styles.header}>
      <div><h1>Analytique &amp; Finances</h1><p>Suivi de ton activité Chogan · {period.label}</p></div>
      {report && <nav className={styles.exports} aria-label="Exports de la période">
        <a href={financeApi + "?" + period.query + "&format=xlsx"} download><Download size={16} aria-hidden="true" /> Excel</a>
        <a href={financeApi + "?" + period.query + "&format=pdf"} download><Download size={16} aria-hidden="true" /> PDF</a>
      </nav>}
    </header>
    <Filters key={period.query} period={period} />
    {notice && <p className={styles.info} role="status">{notice}</p>}
    {report ? <>
      <Summary report={report} />
      <div className={styles.charts}><Chart report={report} /><ExpenseChart report={report} /></div>
      <Sales report={report} />
      <div className={styles.ledgers}><Ledger report={report} /><Ledger report={report} commission /></div>
      <p className={styles.caption}>Les frais de livraison facturés sont inclus dans les ventes. Saisis les frais de livraison que tu as payés dans les dépenses, et les coûts des produits revendus sur les ventes correspondantes.</p>
    </> : <p className={styles.info} role="alert">Les données financières sont temporairement indisponibles.</p>}
  </main>;
}
