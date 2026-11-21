"use client";

import styles from "../consultant.module.css";

export default function InvoiceUpload({ clientId, today }) {
  return <form action={`/api/consultant/invoices/${clientId}`} method="post" encType="multipart/form-data" className={styles.form}>
    <label>Date de la facture<input name="document_date" type="date" max={today} required /></label>
    <label>Facture PDF (3 Mo maximum)
      <input type="file" name="invoice" accept=".pdf,application/pdf" required onChange={event => {
        const input = event.currentTarget;
        input.setCustomValidity(input.files[0]?.size > 3 * 1024 * 1024 ? "Choisis un PDF de 3 Mo maximum." : "");
        if (!input.validity.valid) input.reportValidity();
      }} />
    </label>
    <button>Importer la facture</button>
  </form>;
}
