"use client";

import { useEffect, useState } from "react";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import { discountCents, lineTotal, orderTotals, readDiscount, savedOrderTotals } from "../../../lib/crm/order-pricing.mjs";
import { orderDate } from "../../../lib/crm/order-receipt.mjs";
import { checkMeetingPromo } from "../../hote/commande/[token]/actions";
import { addOrder } from "./actions";
import styles from "../consultant.module.css";

function previewDiscount(type, value) {
  try { return readDiscount(type, value); }
  catch { return null; }
}

function DiscountFields({ label, type, value, onType, onValue, global = false }) {
  return <>
    <label>{label} · Unité
      <select name={global ? "discount_type" : undefined} value={type} onChange={event => onType(event.target.value)}>
        <option value="percent">Pourcentage (%)</option>
        <option value="euros">Euros (€)</option>
      </select>
    </label>
    <label>{label} ({type === "percent" ? "%" : "€"})
      <input name={global ? "discount_value" : undefined} type="number" min={0}
        max={type === "percent" ? 100 : 999999.99} step="0.01" inputMode="decimal"
        value={value} onChange={event => onValue(event.target.value)} placeholder="0" />
    </label>
  </>;
}

export default function OrderForm({ clientId, token, fixedShipping = 0, deliveryOptions, defaultDeliveryMode, order, today, children, submitAction = addOrder }) {
  const [{ mode, query }, setSearch] = useState({ mode: "code", query: "" });
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState(() => (order?.items ?? []).map(item => ({
    ...item,
    price: (item.unit_cents / 100).toFixed(2),
    discountType: item.discount?.type ?? "percent",
    discountValue: item.discount ? String(item.discount.amount / 100) : "",
  })));
  const [promoInput, setPromoInput] = useState("");
  const [promoCheck, setPromoCheck] = useState(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const activePromo = promoCheck?.code === promoInput.trim().toUpperCase() ? promoCheck : null;

  async function applyPromo() {
    setCheckingPromo(true);
    const code = promoInput.trim().toUpperCase();
    try {
      const match = await checkMeetingPromo(token, code);
      setPromoCheck(match ?? { code, amount: null });
    } catch {
      setPromoCheck({ code, amount: null });
    } finally {
      setCheckingPromo(false);
    }
  }

  const [deliveryMode, setDeliveryMode] = useState(defaultDeliveryMode ?? "grouped");
  const [shipping, setShipping] = useState(order ? String(order.shipping_cents / 100) : "");
  const legacyOrder = order && !order.items.length ? order : null;
  const legacySubtotal = legacyOrder ? savedOrderTotals(legacyOrder).subtotal : null;
  const [discountType, setDiscountType] = useState(order?.order_discount?.type ?? "percent");
  const [discountValue, setDiscountValue] = useState(order?.order_discount ? String(order.order_discount.amount / 100) : "");
  const [message, setMessage] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);

  const searchQuery = query.trim();
  useEffect(() => {
    if (searchQuery.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await fetch("/api/consultant/catalogue?" + new URLSearchParams({ q: searchQuery, mode }), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(22000)]),
          headers: token ? { "X-Order-Link": token } : undefined,
        });
        const data = await result.json();
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setMessage(data.error || "Le catalogue est indisponible.");
          setSearchFailed(result.status >= 500);
          return;
        }
        setItems(data.items);
        if (!data.items.length) setMessage("Aucun produit trouvé. Essaie un autre code ou nom de produit.");
      } catch {
        if (!controller.signal.aborted) {
          setMessage("La recherche du catalogue a échoué.");
          setSearchFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, mode, token, attempt]);

  function updateQuery(nextMode, value) {
    setSearch({ mode: nextMode, query: value });
    if (nextMode === mode && value.trim() === searchQuery) return;
    setItems([]);
    setMessage("");
    setSearchFailed(false);
    setLoading(value.trim().length >= 2);
  }

  function selectProduct(id) {
    const item = items.find(item => String(item.id) === id);
    if (!item) return;
    setLines(current => current.length >= 20 || current.some(line => line.id === item.id)
      ? current : [...current, { ...item, quantity: 1, price: (item.unit_cents / 100).toFixed(2), discountType: "percent", discountValue: "" }]);
    setMessage(item.title + " ajouté au bon.");
  }

  function updateLine(id, changes) {
    setLines(current => current.map(line => line.id === id ? { ...line, ...changes } : line));
  }

  const pricedLines = lines.map(line => ({
    ...line,
    unit_cents: token ? line.unit_cents : parseCents(line.price) ?? line.unit_cents,
    discount: token ? null : previewDiscount(line.discountType, line.discountValue),
  }));
  const productTotal = lines.length ? pricedLines.reduce((sum, line) => sum + lineTotal(line), 0) : legacySubtotal;
  const shippingCents = token ? deliveryOptions?.find(option => option.mode === deliveryMode)?.cents ?? fixedShipping : parseCents(shipping) ?? 0;
  const discount = token ? (activePromo?.amount ? { type: "percent", amount: activePromo.amount } : null) :
    previewDiscount(discountType, discountValue);
  const { savings, total } = orderTotals(productTotal, discount, shippingCents);
  const displayAmount = amount => Number.isFinite(amount) ? formatEuros(amount) : "À confirmer";
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
      {searchFailed && <button type="button" onClick={() => {
        setSearchFailed(false);
        setMessage("");
        setLoading(true);
        setAttempt(current => current + 1);
      }}>Réessayer la recherche</button>}
    </div>
    <form action={submitAction} className={styles.form}>
      {children}
      {deliveryOptions && <>
        <label>Mode de livraison
          <select name="meeting_delivery_mode" value={deliveryMode} onChange={event => setDeliveryMode(event.target.value)} required>
            {deliveryOptions.map(({ mode, label, cents }) => <option key={mode} value={mode}>
              {label} · {cents === 0 ? "Gratuite" : formatEuros(cents)}
            </option>)}
          </select>
        </label>
        {deliveryMode === "individual" && <label>Adresse de livraison
          <textarea name="delivery_address" autoComplete="street-address" minLength={5} maxLength={500} rows={3} required
            placeholder="Rue, code postal et ville" />
        </label>}
      </>}
      {deliveryOptions && <div className={styles.orderActions}>
        <label>Code promo (facultatif)
          <input name="promo_code" maxLength={30} autoComplete="off" value={promoInput}
            onChange={event => setPromoInput(event.target.value)} />
        </label>
        <button type="button" onClick={applyPromo} disabled={!promoInput.trim() || checkingPromo}>
          {checkingPromo ? "Vérification…" : "Appliquer le code promo"}
        </button>
        {activePromo && <p role="status">{activePromo.amount ? "Code appliqué · " + activePromo.amount / 100 + " %" :
          "Code promo invalide ou épuisé."}</p>}
      </div>}
      {clientId && <input name="client_id" type="hidden" value={clientId} />}
      {!token && <label>Date de commande
        <input name="order_date" type="date" required max={today} defaultValue={order ? orderDate(order) : today} />
      </label>}
      {!token && !order && <label>Statut à l’enregistrement
        <select name="initial_status" defaultValue="pending">
          <option value="pending">En attente</option>
          <option value="processed">Traitée (terminée et payée)</option>
        </select>
      </label>}
      <input name="lines" type="hidden" value={JSON.stringify(lines.map(({ handle, id, quantity, price, discountType, discountValue }) => ({
        handle, id, quantity, ...(!token && { price, discountType, discountValue }),
      })))} />
      {lines.length > 0 ? <ul className={`${styles.trips} ${styles.orderLines}`}>
        {pricedLines.map(line => <li className={styles.panel} key={line.id}>
          <p><strong>{line.title}</strong>{line.format && " · " + line.format}{token && " · " + formatEuros(line.unit_cents) + " / unité"}</p>
          <div className={styles.orderFields}>
            <label>Quantité<input type="number" min={1} max={999} required value={line.quantity || ""}
              onChange={event => updateLine(line.id, { quantity: Number(event.target.value) })} /></label>
            {!token && <>
              <label>Prix unitaire (€)<input type="number" min={0} max={999999.99} step="0.01" inputMode="decimal" required
                value={line.price} onChange={event => updateLine(line.id, { price: event.target.value })} /></label>
              <DiscountFields label="Remise article" type={line.discountType} value={line.discountValue}
                onType={discountType => updateLine(line.id, { discountType })}
                onValue={discountValue => updateLine(line.id, { discountValue })} />
            </>}
          </div>
          {!token && <p>Total article {displayAmount(lineTotal(line))}
            {line.quantity > 0 && lineTotal(line) === 0 && <strong> · Offert</strong>}
            {line.discount && <> · Remise −{displayAmount(discountCents(line.unit_cents * line.quantity, line.discount))}</>}
          </p>}
          <button type="button" onClick={() => setLines(current => current.filter(item => item.id !== line.id))}>Retirer du bon</button>
        </li>)}
      </ul> : legacyOrder ? <>
        <p style={{ whiteSpace: "pre-wrap" }}>{legacyOrder.details}</p>
        <input type="hidden" name="details" value={legacyOrder.details} />
        <input type="hidden" name="total" value={legacySubtotal === null ? "" : (legacySubtotal / 100).toFixed(2)} />
      </> : <p>Ajoute au moins un produit au bon.</p>}
      {!token && <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" value={shipping} onChange={event => setShipping(event.target.value)} placeholder="0,00" /></label>}
      {!token && <fieldset className={styles.orderDiscount}>
        <legend>Remise globale</legend>
        <div className={styles.orderFields}>
          <DiscountFields label="Remise globale" type={discountType} value={discountValue}
            onType={setDiscountType} onValue={setDiscountValue} global />
        </div>
      </fieldset>}
      <dl className={`${styles.receiptTotals} ${styles.orderLines}`} aria-live="polite">
        <div><dt>Sous-total produits</dt><dd>{displayAmount(productTotal)}</dd></div>
        {savings > 0 && <div><dt>{token ? "Code promo" : "Remise globale"}</dt><dd>−{displayAmount(savings)}</dd></div>}
        <div><dt>Livraison</dt><dd>{displayAmount(shippingCents)}</dd></div>
        <div><dt>Total à payer</dt><dd><strong>{displayAmount(total)}</strong></dd></div>
      </dl>
      <button disabled={(deliveryOptions && Boolean(promoInput.trim()) && (checkingPromo || !activePromo?.amount)) ||
        (!lines.length && (!legacyOrder || (legacySubtotal === null && !!previewDiscount(discountType, discountValue))))}>{token ? "Envoyer mon bon de commande" : order ? "Enregistrer les modifications" : "Enregistrer le bon"}</button>
    </form>
  </>;
}
