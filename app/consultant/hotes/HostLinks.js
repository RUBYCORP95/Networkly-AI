"use client";

import { useState } from "react";
import QRCode from "qrcode";
import styles from "../consultant.module.css";

function ShareLink({ path, label }) {
  const [share, setShare] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const url = () => new URL(path, window.location.origin).href;
  async function generate() {
    setBusy(true);
    setStatus("");
    try {
      const href = url();
      setShare({ url: href, qr: null });
      const qr = await QRCode.toDataURL(href, { width: 240, margin: 4 });
      setShare({ url: href, qr });
    } catch { setStatus("Impossible de générer le QR code. Le lien reste disponible."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url()); setStatus("Lien copié."); }
    catch { setStatus("Ouvre le lien puis copie son adresse."); }
  }
  return <section className={styles.panel}>
    <a href={path} className={styles.crmAction}>{label}</a>
    <div className={styles.orderActions}>
      <button type="button" onClick={copy}>Copier le lien</button>
      <button type="button" disabled={busy} onClick={generate}>{busy ? "Création…" : "QR code et partage"}</button>
    </div>
    {share && <>
      {share.qr && <img src={share.qr} width={240} height={240} alt={"QR code : " + label} style={{maxWidth:"100%",height:"auto"}} />}
      <div className={styles.orderActions}>
        <a className={styles.crmAction} href={"https://wa.me/?text=" + encodeURIComponent(label + " : " + share.url)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a className={styles.crmAction} href={"mailto:?subject=" + encodeURIComponent(label) + "&body=" + encodeURIComponent(share.url)}>E-mail</a>
        {share.qr && <a className={styles.crmAction} href={share.qr} download="tesami-qr-code.png">Télécharger le QR code</a>}
      </div>
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}

export default function HostLinks({ orderPath, trackingPath }) {
  return <div>
    <ShareLink key={orderPath} path={orderPath} label="Lien de commande pour le client" />
    <ShareLink key={trackingPath} path={trackingPath} label="Lien de suivi pour l’hôte ou l’hôtesse" />
  </div>;
}
