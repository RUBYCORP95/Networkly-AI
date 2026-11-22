"use client";

import { useRef, useState } from "react";
import { maxPaymentLinks, paymentLabelLimit, paymentUrlLimit } from "../../../lib/crm/payment-links.mjs";
import { savePaymentLinks } from "./actions";
import styles from "../consultant.module.css";

export default function PaymentLinksForm({ links }) {
  const initial = links.length ? links : [{ label: "", url: "" }];
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState(() => initial.map((entry, key) => ({ ...entry, key })));
  return <form action={savePaymentLinks} className={styles.trips}>
    {rows.map((row, index) => <div className={styles.form} key={row.key}>
      <label>Nom du moyen de paiement {index + 1}<input name="payment_label" maxLength={paymentLabelLimit}
        defaultValue={row.label} placeholder="Wero, Stripe, PayPal…" /></label>
      <label>Lien de paiement {index + 1}<input name="payment_url" type="url" maxLength={paymentUrlLimit}
        defaultValue={row.url} placeholder="https://…" /></label>
      <button type="button" onClick={() => setRows(current => current.filter(entry => entry.key !== row.key))}
        aria-label={"Retirer le moyen de paiement " + (index + 1)}>Retirer</button>
    </div>)}
    <div className={styles.orderActions}>
      <button type="button" disabled={rows.length >= maxPaymentLinks} onClick={() => {
        const key = nextKey.current++;
        setRows(current => [...current, { key, label: "", url: "" }]);
      }}>Ajouter un moyen de paiement</button>
      <button>Enregistrer les moyens de paiement</button>
    </div>
  </form>;
}
