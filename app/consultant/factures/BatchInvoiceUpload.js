"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { invoiceAccount, invoiceApi, invoiceIssuer, invoiceNumber, maxInvoiceBatch, maxInvoiceBytes, validInvoiceDate } from "../../../lib/crm/invoice-archive.mjs";
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

function canSave(row, today) {
  return invoiceIssuer(row.issuer) && invoiceNumber(row.number) && validInvoiceDate(row.date, today) &&
    (!row.account || invoiceAccount(row.account)) && Number.isInteger(parseCents(row.amount)) && row.confirmed;
}

export default function BatchInvoiceUpload({ today, customers = [], clientId = null }) {
  const router = useRouter();
  const selected = useRef(null);
  const selection = useRef(0);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setNotice("");
    const items = files.map((file, index) => ({ id: batch + "-" + index, file, state: "reading", client: clientId ?? "",
      number: "", date: "", amount: "", issuer: "", account: "", confirmed: false }));
    setRows(items);
    for (const row of items) {
      if (row.file.size > maxInvoiceBytes || !/\.pdf$/i.test(row.file.name)) {
        patch(row.id, { state: "blocked", message: "Choisis un PDF de 3 Mo maximum." });
        continue;
      }
      try {
        const details = await send("inspect", { invoice: row.file });
        patch(row.id, {
          state: details.duplicate ? "duplicate" : "ready",
          number: details.number ?? "", numberRead: Boolean(details.number), date: details.date ?? "",
          amount: details.amount ?? "", issuer: details.issuer ?? "", account: details.account ?? "",
          accountAmbiguous: details.accountAmbiguous, accountSuggested: Boolean(details.account && !details.accountFromPdf),
          message: details.duplicate ? "Déjà archivée." : "",
        });
      } catch (error) {
        patch(row.id, { state: "blocked", message: error.message });
      }
    }
    setBusy(false);
    if (selected.current) selected.current.value = "";
  }

  async function suggest(row) {
    if (row.account || row.accountAmbiguous || !invoiceIssuer(row.issuer)) return;
    try {
      const result = await send("suggest", { issuer_name: row.issuer });
      if (result.account) setRows(items => items.map(item =>
        item.id === row.id && item.issuer === row.issuer && !item.account ? { ...item, account: result.account, accountSuggested: true } : item));
    } catch {
      // The account is still editable when suggestions are unavailable.
    }
  }

  const ready = rows.filter(row => row.state === "ready");
  async function upload(event) {
    event.preventDefault();
    if (busy || !ready.length || !ready.every(row => canSave(row, today))) return;
    setBusy(true);
    setNotice("");
    let archived = 0;
    for (const row of ready) {
      try {
        await send("save", {
          invoice: row.file, document_number: row.number, document_date: row.date, issuer_name: row.issuer,
          account_number: row.account, client_id: row.client, document_amount: row.amount,
          confirmed_cents: String(parseCents(row.amount)),
        });
        ++archived;
        patch(row.id, { state: "saved", message: "Archivée." });
      } catch (error) {
        if (error.message === "Cette facture est déjà archivée.") patch(row.id, { state: "duplicate", message: error.message });
        else patch(row.id, { message: error.message });
      }
    }
    if (archived) router.refresh();
    setNotice(archived + (archived === 1 ? " facture archivée." : " factures archivées."));
    setBusy(false);
  }

  return <form onSubmit={upload} className={styles.batch}>
    <label className={styles.pick}>Sélectionner des factures PDF
      <input ref={selected} type="file" accept=".pdf,application/pdf" multiple disabled={busy} onChange={choose} />
    </label>
    <p className={styles.muted}>Jusqu’à {maxInvoiceBatch} PDF à la fois, 3 Mo par fichier. Complète les informations que TESAMI ne peut pas lire.</p>
    {rows.map(row => {
      const amount = parseCents(row.amount);
      const change = (field, value) => patch(row.id, {
        [field]: value,
        ...(field === "amount" ? { confirmed: false } : {}),
        ...(field === "account" ? { accountSuggested: false } : {}),
        ...(field === "issuer" && row.accountSuggested ? { account: "", accountSuggested: false } : {}),
      });
      return <fieldset key={row.id} className={styles.file}>
        <legend>{row.file.name}</legend>
        {row.state === "reading" && <p role="status">Lecture du PDF…</p>}
        {row.state === "ready" && <div className={shared.form}>
          <label>Numéro sur le PDF<input value={row.number} maxLength={80} required readOnly={row.numberRead}
            disabled={busy} onChange={event => change("number", event.target.value)} /></label>
          <label>Date de la facture<input type="date" value={row.date} max={today} required
            disabled={busy} onChange={event => change("date", event.target.value)} /></label>
          <label>Société émettrice<input value={row.issuer} maxLength={120} required disabled={busy}
            onChange={event => change("issuer", event.target.value)} onBlur={() => suggest(row)} /></label>
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
    {rows.length > 0 && <button disabled={busy || !ready.length || !ready.every(row => canSave(row, today))}>
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
      <label>Compte comptable<input name="account_number" inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20}
        defaultValue={invoice.account_number ?? ""} /></label>
      <button disabled={busy}>Enregistrer</button>
      {status && <p role="status">{status}</p>}
    </form>
  </details>;
}
