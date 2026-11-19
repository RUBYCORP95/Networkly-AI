"use client";

import { useState } from "react";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import { addOrder } from "./actions";
import styles from "../consultant.module.css";

export default function OrderForm({ clientId }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);
  const [shipping, setShipping] = useState("");
  const [manualTotal, setManualTotal] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event) {
    event.preventDefault();
    setLoading(true);
    setItems([]);
    setMessage("");
    try {
      const result = await fetch("/api/consultant/catalogue?" + new URLSearchParams({ q: query }));
      const data = await result.json();
      if (!result.ok) throw new Error(data.error);
      setItems(data.items);
      if (!data.items.length) setMessage("Aucune variante disponible. Essaie une autre référence ou un lien produit.");
    } catch (error) {
      setMessage(error.message || "Recherche indisponible.");
    } finally {
      setLoading(false);
    }
  }

  const productTotal = lines.length ? lines.reduce((sum, line) => sum + line.unit_cents * line.quantity, 0) : parseCents(manualTotal);
  const shippingCents = parseCents(shipping) ?? 0;
  return <>
    <form onSubmit={search} className={styles.form}>
      <label>Produit, référence ou lien Parfum Inspiration<input type="search" value={query} maxLength={240} onChange={event => setQuery(event.target.value)} required /></label>
      <button disabled={loading}>{loading ? "Recherche…" : "Rechercher"}</button>
    </form>
    {message && <p role="status">{message}</p>}
    {items.length > 0 && <ul className={styles.trips}>{items.map(item => <li className={styles.panel} key={item.id}>
      <p>{item.title}{item.format && " · " + item.format}{item.reference && " · Réf. " + item.reference} · {formatEuros(item.unit_cents)}</p>
      <button type="button" disabled={lines.length >= 20 || lines.some(line => line.id === item.id)} onClick={() => setLines([...lines, {...item, quantity: 1}])}>Ajouter au bon</button>
    </li>)}</ul>}
    <form action={addOrder} className={styles.form}>
      <input name="client_id" type="hidden" value={clientId} />
      <input name="lines" type="hidden" value={JSON.stringify(lines.map(({ handle, id, quantity }) => ({ handle, id, quantity })))} />
      {lines.length > 0 ? <ul className={styles.trips} style={{ flexBasis: "100%" }}>
        {lines.map(line => <li className={styles.panel} key={line.id}>
          <p>{line.title}{line.format && " · " + line.format} · {formatEuros(line.unit_cents)} / unité</p>
          <label>Quantité<input type="number" min={1} max={999} required value={line.quantity || ""} onChange={event => setLines(lines.map(item => item.id === line.id ? {...item, quantity: Number(event.target.value)} : item))} /></label>
          <button type="button" onClick={() => setLines(lines.filter(item => item.id !== line.id))}>Retirer du bon</button>
        </li>)}
      </ul> : <>
        <label>Produits et quantités<textarea name="details" maxLength={4000} rows={3} required /></label>
        <label>Sous-total des produits (€)<input name="total" type="number" min={0} max={999999.99} step="0.01" value={manualTotal} onChange={event => setManualTotal(event.target.value)} /></label>
      </>}
      <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" value={shipping} onChange={event => setShipping(event.target.value)} placeholder="0,00" /></label>
      <p style={{ flexBasis: "100%" }}>Sous-total {productTotal === null ? "à confirmer" : formatEuros(productTotal)} · Livraison {formatEuros(shippingCents)} · Total {productTotal === null ? "à confirmer" : formatEuros(productTotal + shippingCents)}</p>
      <button>Enregistrer le bon</button>
    </form>
  </>;
}
