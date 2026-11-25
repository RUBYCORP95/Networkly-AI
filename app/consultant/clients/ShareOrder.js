"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { createOrderLink } from "./actions";
import styles from "../consultant.module.css";

export default function ShareOrder({ clientId }) {
  const [share, setShare] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(form) {
    setBusy(true);
    setMessage("");
    try {
      const result = await createOrderLink(form);
      if (result.error) return setMessage(result.error);
      const url = new URL("/commande/" + result.token, window.location.origin).href;
      setShare({ url, qr: null });
      const qr = await QRCode.toDataURL(url, { width: 240, margin: 3 });
      setShare({ url, qr });
    } catch {
      setMessage("Un problème est survenu. Tu peux utiliser le lien s’il est affiché.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <form action={create} className={styles.form}>
      <input name="client_id" type="hidden" value={clientId} />
      <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" placeholder="0,00" /></label>
      <button disabled={busy}>{busy ? "Création…" : "Créer le lien et le QR code"}</button>
    </form>
    {share && <div className={styles.panel}>
      <p>Lien valable 24 heures et utilisable une fois.</p>
      {share.qr && <img src={share.qr} width={240} height={240} alt="QR code du bon de commande" style={{ maxWidth: "100%", height: "auto" }} />}
      <p><a className={styles.crmAction} href={share.url}>Ouvrir le bon de commande</a></p>
      <div className={styles.orderActions}>
        <a className={styles.crmAction} href={"https://wa.me/?text=" + encodeURIComponent("Voici ton bon de commande : " + share.url)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a className={styles.crmAction} href={"mailto:?subject=" + encodeURIComponent("Ton bon de commande") + "&body=" + encodeURIComponent(share.url)}>E-mail</a>
        {share.qr && <a className={styles.crmAction} href={share.qr} download="tesami-bon-de-commande.png">Télécharger le QR code</a>}
      </div>
      <button type="button" onClick={async () => {
        try { await navigator.clipboard.writeText(share.url); setMessage("Lien copié."); }
        catch { setMessage("Sélectionne le lien affiché pour le copier."); }
      }}>Copier le lien</button>
      {" "}<a className={styles.crmAction} href={"sms:?body=" + encodeURIComponent("Voici ton bon de commande TESAMI : " + share.url)}>Préparer un SMS</a>
      {" "}<button type="button" onClick={async () => {
        if (!navigator.share) {
          try { await navigator.clipboard.writeText(share.url); setMessage("Lien copié. Colle-le dans ton message Instagram ou SMS."); }
          catch { setMessage("Sélectionne le lien affiché pour le copier."); }
          return;
        }
        try { await navigator.share({ title: "Bon de commande TESAMI", url: share.url }); }
        catch (error) { if (error.name !== "AbortError") setMessage("Utilise Copier le lien pour le partager."); }
      }}>Partager le lien</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </>;
}
