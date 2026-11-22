"use client";

import { useState } from "react";
import styles from "../consultant.module.css";

export default function HostLinks({ orderPath, trackingPath }) {
  const [status, setStatus] = useState("");
  async function copy(path, label) {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
      setStatus(label + " copié.");
    } catch { setStatus("Ouvre le lien, puis copie l’adresse dans ton navigateur."); }
  }
  const orderLabel = "Lien de commande pour le client";
  const trackingLabel = "Lien de suivi pour l’hôte";
  return <div className={styles.orderActions}>
    <a href={orderPath} className={styles.crmAction}>{orderLabel}</a>
    <button type="button" onClick={() => copy(orderPath, orderLabel)}>Copier le lien de commande pour le client</button>
    <a href={trackingPath} className={styles.crmAction}>{trackingLabel}</a>
    <button type="button" onClick={() => copy(trackingPath, trackingLabel)}>Copier le lien de suivi pour l’hôte</button>
    {status && <span role="status">{status}</span>}
  </div>;
}
