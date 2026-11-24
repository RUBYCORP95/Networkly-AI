"use client";

import styles from "./recruitment.module.css";

export function NumberField({ label, value, onChange, max, scale = 1, optional = false }) {
  return <label>{label}<input required={!optional} type="number" inputMode={scale === 1 ? "numeric" : "decimal"} min="0"
    max={max / scale} step={1 / scale} value={value === null ? "" : value / scale}
    onChange={event => onChange(event.target.value === "" && optional ? null : Math.round(Number(event.target.value) * scale))} /></label>;
}

export function ExpenseFields({ expenses, onChange }) {
  const update = (index, field, value) => onChange(expenses.map((row, i) => i === index ? { ...row, [field]: value } : row));
  return <>
    {expenses.map((expense, i) => <div className={styles.line} key={i}>
      <label>Dépense {i + 1}<input required maxLength={80} value={expense.label} onChange={event => update(i, "label", event.target.value)} /></label>
      <NumberField label="Montant (€)" value={expense.cents} max={10000000} scale={100} onChange={value => update(i, "cents", value)} />
      <button type="button" className={styles.secondary} onClick={() => onChange(expenses.filter((_, index) => index !== i))}
        aria-label={`Retirer la dépense ${i + 1}`}>Retirer</button>
    </div>)}
    <button type="button" className={styles.secondary} disabled={expenses.length >= 12}
      onClick={() => onChange([...expenses, { label: "", cents: 0 }])}>Ajouter une dépense</button>
  </>;
}

export async function fetchRecruitment(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Une erreur est survenue.");
  return payload;
}
