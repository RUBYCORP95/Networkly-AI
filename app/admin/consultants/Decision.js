import styles from "../../consultant/consultant.module.css";

export default function Decision({ request }) {
  return <div className={styles.orderNavigation}>
    {[["verified", "Valider"], ["rejected", "Refuser"]].map(([decision, label]) =>
      <details key={decision}>
        <summary className={decision === "verified" ? `${styles.crmAction} ${styles.orderEmailAction}` : styles.crmAction}>{label}</summary>
        <form method="post" action="/admin/consultants/decision">
          <input type="hidden" name="user" value={request.user_id} />
          <input type="hidden" name="version" value={request.updated_at} />
          <input type="hidden" name="decision" value={decision} />
          <input type="hidden" name="confirmed" value="yes" />
          <p>{label} la demande CHOGAN <strong>{request.consultant_identifier}</strong> ?</p>
          <button type="submit" className={styles.crmAction}>Confirmer</button>
        </form>
      </details>
    )}
  </div>;
}
