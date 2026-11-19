"use client";

import { useState } from "react";
import { afterDays, demoSettings, formatDate, isDate, nextBirthday, parisDate } from "../../../lib/crm/dates.mjs";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import OrderReceipt from "../../consultant/clients/OrderReceipt";
import styles from "../../consultant/consultant.module.css";

const sampleSeller = { name: "Alex Morgan", business: "Atelier des senteurs",
  email: "atelier@example.test", phone: "01 00 00 00 00", address: "1 rue des Exemples, 75000 Paris",
  registration: "Identifiant de démonstration" };
const sampleBuyer = { name: "Camille Martin", email: "camille@example.test" };
const sampleProduct = { id: "151W", title: "Parfum Olfazeta", reference: "151W", format: "70 ml", unit_cents: 3500 };
const previousOrders = [
  { id: "demo00000012", created_at: "2026-11-12T10:00Z", total_cents: 3400, shipping_cents: 500,
    items: [{...sampleProduct, unit_cents: 2500, quantity: 1}, {id: "recharge-demo", title: "Recharge de démonstration", format: "15 ml", unit_cents: 900, quantity: 1}] },
  { id: "demo00000005", created_at: "2026-10-05T10:00Z", total_cents: 2500, shipping_cents: 0,
    items: [{...sampleProduct, unit_cents: 2500, quantity: 1}] },
].map(order => ({...order, seller: sampleSeller, buyer: sampleBuyer, status: "completed", payment_status: "paid"}));

export default function CrmDemo() {
  const [birthDate, setBirthDate] = useState(demoSettings.birthDate);
  const [delay, setDelay] = useState(String(demoSettings.delayDays));
  const [notification, setNotification] = useState(demoSettings.notification);
  const [shipping, setShipping] = useState("5.00");
  const [quantity, setQuantity] = useState(1);
  const [order, setOrder] = useState(null);
  const shippingCents = parseCents(shipping) ?? 0;
  const today = parisDate();
  const validDelay = /^\d{1,4}$/.test(delay) && Number(delay) > 0 && Number(delay) <= 3650;
  return <main className={styles.page}>
    <h1>Démo · Clients et rappels</h1>
    <p>Fiche fictive de Camille Martin. Les modifications restent dans cette page.</p>
    <section className={styles.panel}>
      <h2>Paramètres de la fiche</h2>
      <div className={styles.form}>
        <label>Date de naissance<input type="date" value={birthDate} max={today} onChange={e => setBirthDate(e.target.value)} /></label>
        <label>Délai de relance (jours)<input type="number" min={1} max={3650} value={delay} onChange={e => setDelay(e.target.value)} /></label>
        <label>Notification dans TESAMI<input type="checkbox" checked={notification} onChange={e => setNotification(e.target.checked)} /></label>
      </div>
    </section>
    <section className={styles.panel}>
      <h2>Bon de commande · exemple</h2>
      <p>Parfum Olfazeta 151W · 70 ml · {formatEuros(3500)} / unité</p>
      {quantity > 0 ? <div className={styles.form}>
        <label>Quantité<input type="number" min={1} max={999} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
        <button type="button" onClick={() => setQuantity(0)}>Retirer du bon</button>
      </div> : <button type="button" onClick={() => setQuantity(1)}>Ajouter au bon</button>}
      <div className={styles.form}>
        <label>Livraison (€)<input type="number" min={0} max={999999.99} step="0.01" value={shipping} onChange={e => setShipping(e.target.value)} /></label>
      </div>
      <p>Total · {Number.isNaN(shippingCents) ? "Montant invalide" : formatEuros(quantity * 3500 + shippingCents)}</p>
      <button disabled={!Number.isInteger(quantity) || quantity < 1 || quantity > 999 || Number.isNaN(shippingCents)}
        onClick={() => setOrder({ id: "demo00000019", created_at: new Date().toISOString(), seller: sampleSeller, buyer: sampleBuyer, status: "pending", payment_status: "pending", total_cents: quantity * 3500, shipping_cents: shippingCents, items: [{ ...sampleProduct, quantity }] })}>
        Simuler l’envoi du bon
      </button>
    </section>
    <section>
      <h2>Historique des commandes</h2>
      <ul className={styles.trips}>
        {order && <li className={styles.panel}>
          <OrderReceipt order={order} />
          <p>E-mail récapitulatif prévu après validation.</p>
          <div className={styles.form}><label>Paiement<select value={order.payment_status} onChange={e => setOrder({ ...order, payment_status: e.target.value })}>
            <option value="pending">En attente</option><option value="paid">Payé</option><option value="later">À payer plus tard</option>
          </select></label></div>
        </li>}
        {previousOrders.map(previous => <li key={previous.id} className={styles.panel}><OrderReceipt order={previous} /></li>)}
      </ul>
    </section>
    <section>
      <h2>Tableau des relances</h2>
      <p>Rappel créé le {formatDate(today)}</p>
      <ul className={styles.trips}>
        {validDelay && <li className={styles.panel}>Relance · {formatDate(afterDays(today, Number(delay)))} · Notification {notification ? "activée" : "désactivée"}</li>}
        {isDate(birthDate) && birthDate <= today && <li className={styles.panel}>Anniversaire annuel · prochaine échéance le {formatDate(nextBirthday(birthDate, today))} · Notification {notification ? "activée" : "désactivée"}</li>}
      </ul>
    </section>
  </main>;
}
