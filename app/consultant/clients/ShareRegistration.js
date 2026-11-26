"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { createRegistrationLink } from "./actions";
import styles from "../consultant.module.css";

export default function ShareRegistration() {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const result = await createRegistrationLink();
      if (result.error) setMessage(result.error);
      else {
        const href = window.location.origin + "/inscription-client/" + result.token;
        setQr(""); setUrl(href);
        setQr(await QRCode.toDataURL(href, {width:240, margin:4}));
      }
    } catch {
      setMessage("Le lien n’a pas pu être créé.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Lien copié.");
    } catch {
      setMessage("Sélectionne le lien pour le copier.");
    }
  }

  return <div className={styles.form}>
    <button type="button" onClick={generate} disabled={busy}>Créer le lien et le QR code d’inscription client</button>
    {url && <>
      <label>Lien valable 24 heures, à usage unique<input readOnly value={url} onFocus={event => event.target.select()} /></label>
      {qr && <><img src={qr} width={240} height={240} alt="QR code inscription client" style={{maxWidth:"100%",height:"auto"}}/><a href={qr} download="tesami-inscription-client.png">Télécharger le QR code</a></>}
      <button type="button" onClick={copy}>Copier le lien</button>
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
