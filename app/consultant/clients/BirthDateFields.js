"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "../consultant.module.css";

const months = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function parts(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "")
    ? { year: date.slice(0, 4), month: String(Number(date.slice(5, 7))), day: String(Number(date.slice(8, 10))) }
    : { year: "", month: "", day: "" };
}

export default function BirthDateFields({ name, defaultValue = "", max, required = false }) {
  const [date, setDate] = useState(() => parts(defaultValue));
  const year = Number(date.year);
  const month = Number(date.month);
  const day = Number(date.day);
  const maxYear = Number(max?.slice(0, 4)) || new Date().getFullYear();
  const daysInMonth = year >= 1900 && month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 31;
  const formatted = date.year.length === 4 && date.month && date.day
    ? `${date.year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
  const valid = formatted && year >= 1900 && year <= maxYear && day >= 1 &&
    day <= daysInMonth && formatted <= max;
  const filled = Boolean(date.year || date.month || date.day);
  const error = filled && !valid;
  const { pending } = useFormStatus();

  return <fieldset className={styles.birthDateFields}>
    <legend>Date de naissance{required ? " *" : ""}</legend>
    <div className={styles.birthDateGrid}>
      <label>Jour
        <select aria-label="Jour de naissance" value={date.day} required={required || filled}
          onChange={event => setDate(current => ({ ...current, day: event.target.value }))}>
          <option value="">Jour</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map(value =>
            <option key={value} value={value}>{String(value).padStart(2, "0")}</option>)}
        </select>
      </label>
      <label>Mois
        <select aria-label="Mois de naissance" value={date.month} required={required || filled}
          onChange={event => setDate(current => ({ ...current, month: event.target.value }))}>
          <option value="">Mois</option>
          {months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
        </select>
      </label>
      <label>Année
        <input aria-label="Année de naissance" type="number" inputMode="numeric"
          min="1900" max={maxYear} step="1" placeholder="Ex. 1985"
          value={date.year} required={required || filled}
          onChange={event => setDate(current => ({ ...current, year: event.target.value }))} />
      </label>
    </div>
    <input type="hidden" name={name} value={valid ? formatted : ""} />
    <input className={styles.birthDateValidity} aria-label="Date de naissance complète"
      type="text" tabIndex={-1} autoComplete="off" value={valid || (!required && !filled) ? "ok" : ""}
      readOnly required disabled={pending} />
    {error && <small role="alert">Indique une date de naissance valide, sans dépasser aujourd’hui.</small>}
  </fieldset>;
}
