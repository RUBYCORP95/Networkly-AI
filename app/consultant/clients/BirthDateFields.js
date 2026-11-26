"use client";

import { useState } from "react";
import { isBirthday } from "../../../lib/crm/dates.mjs";
import styles from "../consultant.module.css";

const months = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function parts(date) {
  if (!date) return { year: "", month: "", day: "" };
  const [month, day] = date.slice(-5).split("-");
  return { year: date.length === 10 ? date.slice(0, 4) : "", month: String(Number(month)), day: String(Number(day)) };
}

export default function BirthDateFields({ name, defaultValue = "", max, required = false }) {
  const [date, setDate] = useState(() => parts(defaultValue));
  const monthDay = `${date.month.padStart(2, "0")}-${date.day.padStart(2, "0")}`;
  const formatted = date.year ? `${date.year}-${monthDay}` : monthDay;
  const filled = Boolean(date.year || date.month || date.day);
  const valid = Boolean(date.day && date.month && isBirthday(formatted, max));
  const error = Boolean(date.day && date.month && !valid);
  const message = "Indique une date de naissance valide, sans dépasser aujourd’hui.";

  return <fieldset className={styles.birthDateFields}>
    <legend>Date de naissance{required ? " *" : ""}</legend>
    <div className={styles.birthDateGrid}>
      <label>Jour
        <select ref={input => input?.setCustomValidity(error ? message : "")} aria-label="Jour de naissance" value={date.day} required={required || filled}
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
      <label>Année (facultatif)
        <input type="text" inputMode="numeric" autoComplete="bday-year"
          pattern="[0-9]{4}" maxLength={4} placeholder="Ex. 1985"
          value={date.year}
          onChange={event => setDate(current => ({ ...current, year: event.target.value }))} />
      </label>
    </div>
    <input type="hidden" name={name} value={valid ? formatted : filled ? "invalid" : ""} />
    {error && <small role="alert">{message}</small>}
  </fieldset>;
}
