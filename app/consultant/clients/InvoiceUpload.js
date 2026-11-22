"use client";

import { useState } from "react";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import styles from "../consultant.module.css";

export default function InvoiceUpload({ clientId, today }) {
  const [amount, setAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const cents = parseCents(amount);
  const validAmount = Number.isInteger(cents);

  return <form action={`/api/consultant/invoices/${clientId}`} method="post" encType="multipart/form-data" className={styles.form}>
    <label>Date de la facture<input name="document_date" type="date" max={today} required /></label>
    <label>Facture PDF (3 Mo maximum)
      <input type="file" name="invoice" accept=".pdf,application/pdf" required onChange={event => {
        const input = event.currentTarget;
        setConfirmed(false);
        input.setCustomValidity(input.files[0]?.size > 3 * 1024 * 1024 ? "Choisis un PDF de 3 Mo maximum." : "");
        if (!input.validity.valid) input.reportValidity();
      }} />
    </label>
    <label>Montant total indiqué sur le PDF (€)
      <input name="document_amount" inputMode="decimal" maxLength={9} required value={amount}
        onChange={event => { setAmount(event.target.value); setConfirmed(false); }} />
    </label>
    <label className={styles.invoiceConfirmation}>
      <input type="checkbox" name="confirmed_cents" value={validAmount ? cents : ""}
        checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!validAmount} required />
      <span>{validAmount
        ? `Je confirme que le montant de la facture ou du bon de commande est égal à ${formatEuros(cents)}.`
        : "Saisis le montant figurant sur le PDF pour pouvoir le confirmer."}</span>
    </label>
    <button disabled={!validAmount || !confirmed}>Importer la facture</button>
  </form>;
}
