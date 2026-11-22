"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { invoiceAccount, invoiceApi, invoiceIssuer, invoiceNatures, invoiceNumber, invoiceReviewPageSize, invoiceUploadGroups, maxInvoiceBatch, maxInvoiceBytes, processInvoiceBatch, validInvoiceDate } from "../../../lib/crm/invoice-archive.mjs";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import shared from "../consultant.module.css";
import styles from "./invoices.module.css";

async function send(mode, values) {
  const form = new FormData();
  form.append("mode", mode);
  for (const [key, value] of Object.entries(values)) form.append(key, value);
  const response = await fetch(invoiceApi, { method: "POST", body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Le serveur n’a pas terminé l’opération.");
  return result;
}

function NatureOptions() {
  return <>
    <option value="">À vérifier</option>
    {Object.entries(invoiceNatures).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </>;
}

function canSave(row, today) {
  return invoiceIssuer(row.issuer) && invoiceNumber(row.number) && validInvoiceDate(row.date, today) &&
    (!row.account || invoiceAccount(row.account)) && Number.isInteger(parseCents(row.amount)) && row.confirmed;
}

export default function BatchInvoiceUpload({ today, customers = [], clientId = null }) {
  const router = useRouter();
  const selected = useRef(null);
  const selection = useRef(0);
  const reviewStart = useRef(null);
  const [rows, setRows] = useState([]);
  const [phase, setPhase] = useState(null);
  const busy = phase !== null;
  const [reviewPage, setReviewPage] = useState(0);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState("");

  function patch(id, fields) {
    setRows(items => items.map(row => row.id === id ? { ...row, ...fields } : row));
  }

  async function choose(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;
    if (files.length > maxInvoiceBatch) {
      setNotice("Choisis au maximum " + maxInvoiceBatch + " PDF par lot.");
      event.target.value = "";
      return;
    }
    const batch = ++selection.current;
    setPhase("reading");
    setNotice("");
    setReviewPage(0);
    setProgress(null);
    const items = files.map((file, index) => ({ id: batch + "-" + index, file, state: "reading", client: clientId ?? "",
      number: "", date: "", amount: "", issuer: "", nature: "", account: "", confirmed: false }));
    setRows(items);
    await processInvoiceBatch(items, async row => {
      if (row.file.size > maxInvoiceBytes || !/\.pdf$/i.test(row.file.name)) {
        patch(row.id, { state: "blocked", message: "Choisis un PDF de 3 Mo maximum." });
        return;
      }
      try {
        const details = await send("inspect", { invoice: row.file });
        patch(row.id, {
          state: details.duplicate ? "duplicate" : "ready",
          number: details.number ?? "", numberRead: Boolean(details.number), date: details.date ?? "",
          amount: details.amount ?? "", issuer: details.issuer ?? "", account: details.account ?? "",
          nature: details.nature ?? "", natureAmbiguous: details.natureAmbiguous,
          accountAmbiguous: details.accountAmbiguous, accountSuggested: Boolean(details.account && !details.accountFromPdf),
          message: details.duplicate ? "Déjà archivée." : "",
        });
      } catch (error) {
        patch(row.id, { state: "blocked", message: error.message });
      }
    });
    setPhase(null);
    if (selected.current) selected.current.value = "";
  }

  async function suggest(row) {
    if (row.account || row.accountAmbiguous || (row.natureAmbiguous && !row.nature) ||
        (!row.nature && !invoiceIssuer(row.issuer))) return;
    try {
      const result = await send("suggest", { issuer_name: row.issuer, document_nature: row.nature });
      if (result.account) setRows(items => items.map(item =>
        item.id === row.id && item.issuer === row.issuer && item.nature === row.nature && !item.account ? { ...item, account: result.account, accountSuggested: true } : item));
    } catch {
      // The account is still editable when suggestions are unavailable.
    }
  }

  const ready = rows.filter(row => row.state === "ready");
  const confirmed = ready.filter(row => canSave(row, today)).length;
  const pageCount = Math.max(1, Math.ceil(rows.length / invoiceReviewPageSize));
  const page = Math.min(reviewPage, pageCount - 1);
  const pageStart = page * invoiceReviewPageSize;
  const displayed = rows.slice(pageStart, pageStart + invoiceReviewPageSize);
  const readCount = rows.filter(row => row.state !== "reading").length;

  function changePage(next, scrollBack) {
    setReviewPage(next);
    if (scrollBack) reviewStart.current?.focus();
  }

  function pageButtons(position) {
    if (pageCount === 1) return null;
    return <nav className={styles.pagination} aria-label={"Pages du lot, " + position}>
      <button type="button" disabled={page === 0} onClick={() => changePage(page - 1, position === "en bas")}>Précédents</button>
      <span>PDF {pageStart + 1} à {pageStart + displayed.length} sur {rows.length}</span>
      <button type="button" disabled={page + 1 === pageCount} onClick={() => changePage(page + 1, position === "en bas")}>Suivants</button>
    </nav>;
  }
  async function upload(event) {
    event.preventDefault();
    if (busy || !ready.length || confirmed !== ready.length) return;
    setPhase("saving");
    setNotice("");
    setProgress({ done: 0, total: ready.length });
    let archived = 0;

    // Keep each issuer in selection order so duplicates and learned accounts are resolved consistently.
    await processInvoiceBatch(invoiceUploadGroups(ready), async group => {
      for (const row of group) {
        try {
          await send("save", {
            invoice: row.file, document_number: row.number, document_date: row.date, issuer_name: row.issuer,
            document_nature: row.nature, account_number: row.account, client_id: row.client, document_amount: row.amount,
            confirmed_cents: String(parseCents(row.amount)),
          });
          ++archived;
          patch(row.id, { state: "saved", message: "Archivée." });
        } catch (error) {
          if (error.message === "Cette facture est déjà archivée.") patch(row.id, { state: "duplicate", message: error.message });
          else patch(row.id, { message: error.message });
        } finally {
          setProgress(current => ({ ...current, done: current.done + 1 }));
        }
      }
    });
    if (archived) router.refresh();
    setNotice(archived + (archived === 1 ? " facture archivée." : " factures archivées."));
    setPhase(null);
  }

  return <form onSubmit={upload} className={styles.batch}>
    <label className={styles.pick}>Sélectionner des factures PDF
      <input ref={selected} type="file" accept=".pdf,application/pdf" multiple disabled={busy} onChange={choose} />
    </label>
    <p className={styles.muted}>Jusqu’à {maxInvoiceBatch} PDF à la fois, 3 Mo par fichier. Complète les informations que TESAMI ne peut pas lire.</p>
    {rows.length > 0 && <div ref={reviewStart} tabIndex={-1} className={styles.batchProgress}>
      {phase === "reading" && <p>Lecture des PDF · {readCount} sur {rows.length}
        <progress aria-label="Lecture des PDF" value={readCount} max={rows.length} /></p>}
      {phase === "saving" && progress && <p>Import des PDF · {progress.done} sur {progress.total}
        <progress aria-label="Import des PDF" value={progress.done} max={progress.total} /></p>}
      {!busy && ready.length > 0 && <p>{confirmed} sur {ready.length} PDF prêts à être importés.</p>}
      {pageButtons("en haut")}
    </div>}
    {displayed.map(row => {
      const amount = parseCents(row.amount);
      const change = (field, value) => {
        const updates = {
          [field]: value,
          ...(field === "amount" ? { confirmed: false } : {}),
          ...(field === "account" ? { accountSuggested: false } : {}),
          ...((field === "issuer" || field === "nature") && row.accountSuggested ? { account: "", accountSuggested: false } : {}),
        };
        patch(row.id, updates);
        if (field === "nature") suggest({ ...row, ...updates });
      };
      return <fieldset key={row.id} className={styles.file}>
        <legend>{row.file.name}</legend>
        {row.state === "reading" && <p>Lecture du PDF…</p>}
        {row.state === "ready" && <div className={shared.form}>
          <label>Numéro sur le PDF<input value={row.number} maxLength={80} required readOnly={row.numberRead}
            disabled={busy} onChange={event => change("number", event.target.value)} /></label>
          <label>Date de la facture<input type="date" value={row.date} max={today} required
            disabled={busy} onChange={event => change("date", event.target.value)} /></label>
          <label>Société émettrice<input value={row.issuer} maxLength={120} required disabled={busy}
            onChange={event => change("issuer", event.target.value)} onBlur={() => suggest(row)} /></label>
          <label>Type de facture<select value={row.nature} disabled={busy}
            onChange={event => change("nature", event.target.value)}><NatureOptions /></select></label>
          <label>Compte comptable<input value={row.account} inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20}
            placeholder="À classer" disabled={busy} onChange={event => change("account", event.target.value)} /></label>
          {!clientId && <label>Client (facultatif)<select value={row.client} disabled={busy} onChange={event => change("client", event.target.value)}>
            <option value="">Aucun client lié</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select></label>}
          <label>Montant total sur le PDF (€)<input value={row.amount} inputMode="decimal" maxLength={9} required
            disabled={busy} onChange={event => change("amount", event.target.value)} /></label>
          <label className={shared.invoiceConfirmation}>
            <input type="checkbox" checked={row.confirmed} disabled={busy || !Number.isInteger(amount)}
              onChange={event => change("confirmed", event.target.checked)} />
            <span>{Number.isInteger(amount)
              ? "Je confirme que le montant de la facture ou du bon de commande est égal à " + formatEuros(amount) + "."
              : "Saisis le montant indiqué sur le PDF pour le confirmer."}</span>
          </label>
          <button type="button" onClick={() => setRows(items => items.filter(item => item.id !== row.id))} disabled={busy}>
            Retirer du lot
          </button>
        </div>}
        {row.message && <p role={row.state === "ready" ? "alert" : "status"}>{row.message}</p>}
      </fieldset>;
    })}
    {pageButtons("en bas")}
    {rows.length > 0 && <button disabled={busy || !ready.length || confirmed !== ready.length}>
      {busy ? "Traitement en cours…" : "Importer les factures"}
    </button>}
    {notice && <p role="status">{notice}</p>}
  </form>;
}

export function InvoiceClassification({ invoice }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      await send("classify", { ...fields, id: invoice.id });
      setStatus("Classement enregistré.");
      router.refresh();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }
  return <details>
    <summary>Modifier le classement</summary>
    <form onSubmit={save} className={shared.form}>
      <label>Société émettrice<input name="issuer_name" maxLength={120} defaultValue={invoice.issuer_name ?? ""} /></label>
      <label>Type de facture<select name="document_nature" defaultValue={invoice.document_nature ?? ""}>
        <NatureOptions />
      </select></label>
      <label>Compte comptable<input name="account_number" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20}
        defaultValue={invoice.account_number ?? ""} /></label>
      <button disabled={busy}>Enregistrer</button>
      {status && <p role="status">{status}</p>}
    </form>
  </details>;
}

export function InvoiceNatureAccounts({ accounts }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await send("nature_accounts", Object.fromEntries(new FormData(event.currentTarget)));
      setStatus("Comptes enregistrés pour les prochains imports.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <details className={styles.account}>
    <summary>Comptes par type de facture</summary>
    <p className={styles.muted}>TESAMI utilise ces comptes quand il reconnaît un type et qu’aucun compte ne figure sur le PDF.</p>
    <form className={shared.form} onSubmit={save}>
      <label>Compte pour les abonnements<input name="subscription_account" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20}
        defaultValue={accounts?.subscription_account ?? ""} /></label>
      <label>Compte pour le matériel<input name="equipment_account" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20}
        defaultValue={accounts?.equipment_account ?? ""} /></label>
      <button disabled={busy}>Enregistrer les comptes</button>
    </form>
    {status && <p role="status">{status}</p>}
  </details>;
}
