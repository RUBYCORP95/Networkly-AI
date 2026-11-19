"use client";

import { useEffect, useState } from "react";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import { addOrder } from "./actions";
import styles from "../consultant.module.css";

export default function OrderForm({ clientId, token, fixedShipping = 0, submitAction = addOrder }) {
  const [{ mode, query }, setSearch] = useState({ mode: "code", query: "" });
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);
  const [shipping, setShipping] = useState("");
  const [manualTotal, setManualTotal] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const searchQuery = query.trim();
  useEffect(() => {
    if (searchQuery.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await fetch("/api/consultant/catalogue?" + new URLSearchParams({ q: searchQuery, mode }), {
          signal: controller.signal,
          headers: token ? { "X-Order-Link": token } : undefined,
        });
        const data = await result.json();
        if (!result.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        setItems(data.items);
        if (!data.items.length) setMessage("Aucun produit trouvé. Essaie un autre code ou nom de produit.");
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error.message || "Recherche indisponible.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, mode, token]);

  function updateQuery(nextMode, value) {
    setSearch({ mode: nextMode, query: value });
    if (nextMode === mode && value.trim() === searchQuery) return;
    setItems([]);
    setMessage("");
    setLoading(value.trim().length >= 2);
  }

  function selectProduct(id) {
    const item = items.find(item => String(item.id) === id);
    if (!item) return;
    setLines(current => current.length >= 20 || current.some(line => line.id === item.id)
      ? current : [...current, { ...item, quantity: 1 }]);
    setMessage(item.title + " ajouté au bon.");
  }

  const productTotal = lines.length ? lines.reduce((sum, line) => sum + line.unit_cents * line.quantity, 0) : parseCents(manualTotal);
  const shippingCents = token ? fixedShipping : parseCents(shipping) ?? 0;
  return <>
    <div className={styles.form}>
      <label>Code article
        <input type="search" value={mode === "code" ? query : ""} maxLength={240} placeholder="Ex. 020M"
          onChange={event => updateQuery("code", event.target.value)} />
      </label>
      <label>Nom du produit
        <input type="search" value={mode === "name" ? query : ""} maxLength={240} placeholder="Nom ou lien Parfum Inspiration"
          onChange={event => updateQuery("name", event.target.value)} />
      </label>
      {items.length > 0 && <label>Ajouter un produit au bon
        <select value="" onChange={event => selectProduct(event.target.value)} disabled={lines.length >= 20}>
          <option value="" disabled>Choisir parmi {items.length} résultat(s)</option>
          {items.map(item => <option key={item.id} value={item.id} disabled={lines.some(line => line.id === item.id)}>
            {[item.chogan_code && "Code " + item.chogan_code, item.title, item.format, item.reference && item.reference !== item.chogan_code && "Réf. " + item.reference, formatEuros(item.unit_cents)].filter(Boolean).join(" · ")}
          </option>)}
        </select>
      </label>}
      <p role="status" style={{ flexBasis: "100%", margin: 0 }}>{loading ? "Recherche en cours…" : message}</p>
    </div>
    <form action={submitAction} className={styles.form}>
      {clientId && <input name="client_id" type="hidden" value={clientId} />}
      <input name="lines" type="hidden" value={JSON.stringify(lines.map(({ handle, id, quantity }) => ({ handle, id, quantity })))} />
      {lines.length > 0 ? <ul className={styles.trips} style={{ flexBasis: "100%" }}>
        {lines.map(line => <li className={styles.panel} key={line.id}>
          <p>{line.title}{line.format && " · " + line.format} · {formatEuros(line.unit_cents)} / unité</p>
          <label>Quantité<input type="number" min={1} max={999} required value={line.quantity || ""} onChange={event => setLines(lines.map(item => item.id === line.id ? {...item, quantity: Number(event.target.value)} : item))} /></label>
          <button type="button" onClick={() => setLines(lines.filter(item => item.id !== line.id))}>Retirer du bon</button>
        </li>)}
      </ul> : token ? <p>Ajoute au moins un produit au bon.</p> : <>
        <label>Produits et quantités<textarea name="details" maxLength={4000} rows={3} required /></label>
        <label>Sous-total des produits (€)<input name="total" type="number" min={0} max={999999.99} step="0.01" value={manualTotal} onChange={event => setManualTotal(event.target.value)} /></label>
      </>}
      {!token && <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" value={shipping} onChange={event => setShipping(event.target.value)} placeholder="0,00" /></label>}
      <p style={{ flexBasis: "100%" }}>Sous-total {productTotal === null ? "à confirmer" : formatEuros(productTotal)} · Livraison {formatEuros(shippingCents)} · Total {productTotal === null ? "à confirmer" : formatEuros(productTotal + shippingCents)}</p>
      <button disabled={!!token && !lines.length}>{token ? "Envoyer mon bon de commande" : "Enregistrer le bon"}</button>
    </form>
  </>;
}
