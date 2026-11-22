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
  return <div className={styles.orderActions}>
    <a href={orderPath} className={styles.crmAction}>Ouvrir la commande</a>
    <button type="button" onClick={() => copy(orderPath, "Lien de commande")}>Copier le lien de commande</button>
    <a href={trackingPath} className={styles.crmAction}>Ouvrir le suivi hôte</a>
    <button type="button" onClick={() => copy(trackingPath, "Lien de suivi")}>Copier le lien de suivi</button>
    {status && <span role="status">{status}</span>}
  </div>;
}
