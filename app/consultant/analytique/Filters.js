"use client";

import { useState } from "react";
import { months, periodTypes } from "../../../lib/crm/finance.mjs";
import styles from "./finance.module.css";

export default function Filters({ period }) {
  const [type, setType] = useState(period.type);
  const [from, setFrom] = useState(period.start);
  const [to, setTo] = useState(period.to);

  return <form method="get" className={styles.fields}>
    <label>Période<select name="period" value={type} onChange={event => setType(event.target.value)}>
      {Object.entries(periodTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {type === "range" && <>
      <label>Du<input name="from" type="date" lang="fr-FR" required min="1000-01-01" max={to || "9999-12-31"}
        value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>Au<input name="to" type="date" lang="fr-FR" required min={from || "1000-01-01"} max="9999-12-31"
        value={to} onChange={event => setTo(event.target.value)} /></label>
    </>}
    {type === "month" && <label>Mois<select name="month" defaultValue={period.month}>
      {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
    </select></label>}
    {type === "quarter" && <label>Trimestre<select name="quarter" defaultValue={period.quarter}>
      {[1, 2, 3, 4].map(quarter => <option key={quarter} value={quarter}>Trimestre {quarter}</option>)}
    </select></label>}
    {type !== "range" && <label>Année<input name="year" type="number" min={1000} max={period.today.slice(0, 4)}
      required defaultValue={period.year} /></label>}
    <button>Afficher</button>
  </form>;
}
