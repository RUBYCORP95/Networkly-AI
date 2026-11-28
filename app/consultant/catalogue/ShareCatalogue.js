"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "../consultant.module.css";

export default function ShareCatalogue({ url }) {
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 512, margin: 4 }).then(value => {
      if (!cancelled) setQr(value);
    }).catch(() => { if (!cancelled) setStatus("QR code indisponible."); });
    return () => { cancelled = true; };
  }, [url]);

  async function downloadPdf() {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([420, 540]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const logo = await pdf.embedPng(qr);
      page.drawText("TESAMI · Catalogue Chogan", { x: 51, y: 465, size: 20, font, color: rgb(.16, .1, .08) });
      page.drawImage(logo, { x: 50, y: 115, width: 320, height: 320 });
      page.drawText("Scannez le QR code pour ouvrir le catalogue.", { x: 51, y: 73, size: 12, font });
      const bytes = await pdf.save();
      const object = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = object;
      link.download = "tesami-catalogue-qr.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(object), 10000);
    } catch {
      setStatus("Le QR code PDF est indisponible.");
    }
  }

  return <>
    <p><a href={url}>{url}</a></p>
    {qr && <img width="240" height="240" src={qr} alt="QR code permanent de mon catalogue" />}
    <div className={styles.orderActions}>
      <a className={styles.crmAction} href={"https://wa.me/?text=" + encodeURIComponent("Voici mon catalogue Chogan : " + url)}
        target="_blank" rel="noopener noreferrer">Partager sur WhatsApp</a>
      <button type="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setStatus("Lien copié.");
        } catch {
          setStatus("Sélectionne le lien affiché pour le copier.");
        }
      }}>Copier le lien</button>
      {qr && <>
        <a className={styles.crmAction} href={qr} download="tesami-catalogue-qr.png">Télécharger le PNG</a>
        <button type="button" onClick={downloadPdf}>Télécharger le PDF</button>
      </>}
    </div>
    {status && <p role="status">{status}</p>}
  </>;
}
