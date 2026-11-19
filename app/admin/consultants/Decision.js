"use client";

import { useState } from "react";
import styles from "../../consultant/consultant.module.css";

export default function Decision({ request }) {
  const [decision, setDecision] = useState(null);
  const primary = `${styles.crmAction} ${styles.orderEmailAction}`;

  if (!decision) return <div className={styles.reviewActions}>
    <button type="button" className={primary} onClick={() => setDecision("verified")}>Valider</button>
    <button type="button" className={styles.crmAction} onClick={() => setDecision("rejected")}>Refuser</button>
  </div>;

  return <form method="post" action="/admin/consultants/decision" className={styles.reviewConfirmation}>
    <input type="hidden" name="user" value={request.user_id} />
    <input type="hidden" name="version" value={request.updated_at} />
    <input type="hidden" name="decision" value={decision} />
    <input type="hidden" name="confirmed" value="yes" />
    <p>{decision === "verified" ? "Valider" : "Refuser"} la demande{request.applicant_name ? <> de <strong>{request.applicant_name}</strong></> : ""} ?</p>
    <div className={styles.reviewActions}>
      <button type="submit" className={primary}>Confirmer</button>
      <button type="button" className={styles.crmAction} onClick={() => setDecision(null)}>Annuler</button>
    </div>
  </form>;
}
