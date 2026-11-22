"use client";

import { useState } from "react";
import { months } from "../../../lib/crm/finance.mjs";
import shared from "../consultant.module.css";

export default function InvoiceFilters({ period }) {
  const [type, setType] = useState(period.type);
  const [from, setFrom] = useState(period.from ?? period.today.slice(0, 7) + "-01");
  const [to, setTo] = useState(period.to ?? period.today);
  return <form method="get" className={shared.form}>
    <label>Période<select name="period" value={type} onChange={event => setType(event.target.value)}>
      <option value="all">Toutes les dates</option>
      <option value="range">Dates personnalisées</option>
      <option value="month">Mois</option>
      <option value="year">Année</option>
    </select></label>
    {type === "range" && <>
      <label>Du<input type="date" name="from" min="1000-01-01" max={to || "9999-12-31"} value={from}
        onChange={event => setFrom(event.target.value)} required /></label>
      <label>Au<input type="date" name="to" min={from || "1000-01-01"} max="9999-12-31" value={to}
        onChange={event => setTo(event.target.value)} required /></label>
    </>}
    {type === "month" && <label>Mois<select name="month" defaultValue={period.month}>
      {months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
    </select></label>}
    {(type === "month" || type === "year") && <label>Année<input name="year" type="number" min={1000}
      max={period.today.slice(0, 4)} defaultValue={period.year} required /></label>}
    <button>Afficher</button>
  </form>;
}
