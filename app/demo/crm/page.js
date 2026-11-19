"use client";

import { useState } from "react";
import { afterDays, demoSettings, formatDate, isDate, nextBirthday, parisDate } from "../../../lib/crm/dates.mjs";
import { formatEuros, parseCents } from "../../../lib/crm/money.mjs";
import styles from "../../consultant/consultant.module.css";

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
        onClick={() => setOrder({ quantity, total: quantity * 3500 + shippingCents, payment: "pending" })}>
        Simuler l’envoi du bon
      </button>
    </section>
    <section>
      <h2>Historique des commandes</h2>
      <ul className={styles.trips}>
        {order && <li className={styles.panel}>
          <strong>{order.quantity} × 151W · {formatEuros(order.total)}</strong>
          <div className={styles.form}><label>Paiement<select value={order.payment} onChange={e => setOrder({ ...order, payment: e.target.value })}>
            <option value="pending">En attente</option><option value="paid">Payé</option><option value="later">À payer plus tard</option>
          </select></label></div>
        </li>}
        <li className={styles.panel}><strong>12 novembre 2026 · 39,00 € · Terminée</strong><p>1 parfum et 1 recharge · Sous-total 34,00 € · Livraison 5,00 €</p></li>
        <li className={styles.panel}><strong>5 octobre 2026 · 25,00 € · Terminée</strong><p>1 parfum</p></li>
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
