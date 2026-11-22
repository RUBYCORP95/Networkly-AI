"use client";

import { useState } from "react";
import styles from "../consultant.module.css";

export default function CustomerAccountLink({ token }) {
  const [status, setStatus] = useState("");
  const path = "/inscription-chogan/" + token;
  const orderPath = "/hote/commande/" + token;
  async function copy(path) {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
      setStatus("Lien copié.");
    } catch { setStatus("Ouvre le lien et copie l’adresse dans le navigateur."); }
  }
  return <div className={styles.orderActions}>
    <a className={styles.crmAction} href={path}>Ouvrir le lien de fiche client</a>
    <button type="button" onClick={() => copy(path)}>Copier le lien de fiche client</button>
    <a className={styles.crmAction} href={orderPath}>Ouvrir le lien de commande directe</a>
    <button type="button" onClick={() => copy(orderPath)}>Copier le lien de commande directe</button>
    {status && <p role="status">{status}</p>}
  </div>;
}
