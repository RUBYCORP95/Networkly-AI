"use client";

import { categories, financeApi } from "../../../lib/crm/finance.mjs";
import styles from "./finance.module.css";

export default function EntryForm({ period, entry, commission }) {
  return <form action={financeApi} method="post" encType="multipart/form-data"
    className={styles.fields} key={entry?.id ?? String(commission)}>
    <PeriodFields period={period} />
    {entry && <input name="id" type="hidden" value={entry.id} />}
    <label>Date<input name="entry_date" type="date" required max={period.today}
      defaultValue={entry?.entry_date ?? period.today} /></label>
    {commission ? <input name="category" type="hidden" value="commission" /> :
      <label>Catégorie<select name="category" defaultValue={entry?.category ?? "case"}>
        {Object.entries(categories).filter(([key]) => key !== "commission")
          .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>}
    <label>Libellé<input name="label" maxLength={120} required defaultValue={entry?.label ??
      (commission ? "Virement Chogan" : "")} placeholder={commission ? "Virement Chogan" : "Ex. Mallette Gold"} /></label>
    <label>Montant (€)<input name="amount" inputMode="decimal" maxLength={9} required
      defaultValue={entry ? (entry.amount_cents / 100).toFixed(2) : ""} /></label>
    <label>Justificatif facultatif <small>PDF, PNG ou JPEG · 3 Mo max.</small>
      <input name="receipt" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={event => {
        const input = event.currentTarget;
        input.setCustomValidity(input.files[0]?.size > 3 * 1024 * 1024 ? "Le justificatif dépasse 3 Mo." : "");
        if (!input.validity.valid) input.reportValidity();
      }} />
    </label>
    {entry?.receipt_name && <label className={styles.check}>
      <input name="remove_receipt" type="checkbox" value="yes" /> Retirer le justificatif
    </label>}
    <div className={styles.actions}>
      <button name="operation" value="entry">{entry ? "Enregistrer" : commission ? "Ajouter la commission" : "Ajouter la dépense"}</button>
      {entry && <button className={styles.secondary} name="operation" value="delete" formNoValidate
        onClick={event => { if (!window.confirm("Supprimer cette écriture et son justificatif ?")) event.preventDefault(); }}>
        Supprimer
      </button>}
    </div>
  </form>;
}

export function PeriodFields({ period }) {
  return [...new URLSearchParams(period.query)].map(([name, value]) =>
    <input key={name} type="hidden" name={name} value={value} />);
}
