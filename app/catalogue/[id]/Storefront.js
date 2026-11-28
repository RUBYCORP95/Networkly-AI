"use client";

import { useEffect, useState } from "react";
import { categories, normalizeSearch } from "../../../lib/public-catalogue/model.mjs";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { parisDate } from "../../../lib/crm/dates.mjs";
import { catalogueCheckout } from "./actions";
import styles from "./catalogue.module.css";

export default function Storefront({ id, token, products, meeting }) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("individual");
  const [quote, setQuote] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const key = "tesami-visit-" + id;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    void fetch("/catalogue/" + id + "/visite", { method: "POST", keepalive: true }).catch(() => {});
  }, [id]);

  const terms = normalizeSearch(query).split(/\s+/);
  const filtered = products.filter(product => {
    const text = normalizeSearch([product.title, product.reference, product.format, product.notes, product.description].join(" "));
    return (!category || product.category === category) && (!onlyAvailable || product.available) &&
      terms.every(term => text.includes(term));
  });
  const lines = products.filter(product => quantities[product.id]);
  const cart = lines.map(product => ({ id: String(product.id), quantity: quantities[product.id] }));
  const subtotal = lines.reduce((sum, product) => sum + product.unit_cents * quantities[product.id], 0);

  function invalidate() {
    setQuote(null);
    setMessage("");
  }

  function quantity(id, value) {
    if (busy) return;
    if (!quantities[id] && value > 0 && cart.length >= 20) {
      setMessage("Le panier accepte jusqu’à 20 références.");
      return;
    }
    setSubmitted(false);
    setSubmission(null);
    setQuantities(current => ({ ...current, [id]: Math.min(999, Math.max(0, value)) }));
    invalidate();
  }

  async function calculate() {
    setBusy(true);
    invalidate();
    try {
      const result = await catalogueCheckout(id, token, { cart, code, mode });
      if (result.error) setMessage(result.error);
      else setQuote(result);
    } catch {
      setMessage("Le total est indisponible. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  async function order(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (busy || !quote) return;
    setBusy(true);
    setMessage("");
    try {
      const key = submission ?? crypto.randomUUID();
      setSubmission(key);
      const result = await catalogueCheckout(id, token, { cart, code, mode, submission: key, total: quote.total }, form);
      if (result.error) setMessage(result.error);
      else {
        setQuantities({});
        setQuote(null);
        setCode("");
        setSubmission(null);
        setSubmitted(true);
      }
    } catch {
      setMessage("La réponse n’est pas arrivée. Réessayez pour confirmer l’envoi.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.content}>
    <section id="produits">
      <h2>Explorer le catalogue</h2>
      <div className={styles.filters}>
        <label>Rechercher<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label>Catégorie<select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="">Toutes les catégories</option>
          {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className={styles.check}><input type="checkbox" checked={onlyAvailable}
          onChange={event => setOnlyAvailable(event.target.checked)} /> Produits disponibles</label>
      </div>
      {!filtered.length && <p>{products.length ? "Aucun produit ne correspond à votre recherche." : "Les produits seront bientôt disponibles."}</p>}
      <div className={styles.grid}>
        {filtered.map(product => <article key={product.id} className={styles.product}>
          <img src={product.photo_url} alt={product.photo_alt || product.title} loading="lazy" referrerPolicy="no-referrer" />
          <div className={styles.productBody}>
            <small>{categories[product.category]} · {product.reference}</small>
            <h3>{product.title}</h3>
            {product.format && <p>{product.format}</p>}
            <p className={styles.description}>{product.description}</p>
            {product.notes && <p><strong>Notes olfactives</strong> · {product.notes}</p>}
            <div className={styles.row}>
              <strong>{formatEuros(product.unit_cents)}</strong>
              {product.available ? <button type="button" disabled={busy || quantities[product.id] >= 999}
                aria-label={"Ajouter " + product.title + " au panier"}
                onClick={() => quantity(product.id, (quantities[product.id] ?? 0) + 1)}>
                Ajouter{quantities[product.id] ? " (" + quantities[product.id] + ")" : ""}
              </button> : <span>Indisponible</span>}
            </div>
          </div>
        </article>)}
      </div>
    </section>

    <section id="panier" className={styles.checkout}>
      <h2>Panier</h2>
      {submitted ? <p role="status">Votre commande a été transmise. Votre consultant vous contactera pour la suite et le paiement.</p>
        : !cart.length && <p>Votre panier est vide.</p>}
      {!!cart.length && <>
        <ul className={styles.lines}>
          {lines.map(product => <li key={product.id}>
            <span>{product.title} {product.format}</span>
            <div className={styles.row}>
              <button type="button" disabled={busy} aria-label={"Diminuer la quantité de " + product.title}
                onClick={() => quantity(product.id, quantities[product.id] - 1)}>−</button>
              <output aria-label="Quantité">{quantities[product.id]}</output>
              <button type="button" disabled={busy || quantities[product.id] >= 999}
                aria-label={"Augmenter la quantité de " + product.title} onClick={() => quantity(product.id, quantities[product.id] + 1)}>+</button>
              <strong>{formatEuros(product.unit_cents * quantities[product.id])}</strong>
            </div>
          </li>)}
        </ul>
        <p>Sous-total affiché <strong>{formatEuros(subtotal)}</strong></p>
        <div className={styles.filters}>
          <label>Code promo<input maxLength={30} disabled={busy} value={code}
            onChange={event => { setCode(event.target.value); invalidate(); }} /></label>
          {meeting && <label>Livraison<select disabled={busy} value={mode}
            onChange={event => { setMode(event.target.value); invalidate(); }}>
            <option value="individual">À domicile</option>
            <option value="grouped">Groupée chez l’hôte</option>
          </select></label>}
          <button type="button" disabled={busy} onClick={calculate}>Calculer le total</button>
        </div>
        {quote && <>
          <dl className={styles.totals}>
            <div><dt>Articles</dt><dd>{formatEuros(quote.subtotal)}</dd></div>
            <div><dt>Remise</dt><dd>{formatEuros(quote.savings)}</dd></div>
            <div><dt>Livraison</dt><dd>{formatEuros(quote.shipping)}</dd></div>
            <div><dt>Total TTC</dt><dd>{formatEuros(quote.total)}</dd></div>
          </dl>
          <form onSubmit={order} className={styles.form}>
            <label>Prénom<input name="first_name" autoComplete="given-name" maxLength={60} required /></label>
            <label>Nom<input name="last_name" autoComplete="family-name" maxLength={59} required /></label>
            <label>Date de naissance<input name="customer_birth" type="date" autoComplete="bday" min="1900-01-01" max={parisDate()} required /></label>
            <label>E-mail<input name="customer_email" type="email" autoComplete="email" maxLength={254} required /></label>
            <label>Téléphone (facultatif)<input name="customer_phone" type="tel" autoComplete="tel" maxLength={40} /></label>
            {mode !== "grouped" && <label>Adresse de livraison complète<textarea name="destination"
              autoComplete="street-address" minLength={5} maxLength={500} required /></label>}
            <label className={styles.check}><input name="consent" type="checkbox" required />
              <span>J’accepte que mon consultant utilise ces informations pour retrouver ma fiche et traiter ma commande.</span>
            </label>
            <button disabled={busy}>{busy ? "En cours…" : "Envoyer la commande"}</button>
          </form>
        </>}
      </>}
      {message && <p role="alert">{message}</p>}
    </section>
  </div>;
}
