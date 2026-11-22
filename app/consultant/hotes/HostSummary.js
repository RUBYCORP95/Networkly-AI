import { formatEuros } from "../../../lib/crm/money.mjs";
import { giftProgress } from "../../../lib/crm/hosts.mjs";
import styles from "../consultant.module.css";
import { manageGift } from "./actions";

export default function HostSummary({ sales, gifts, session }) {
  const total = Number(sales?.paid_cents ?? 0);
  const labels = { pending: "À atteindre", available: "Débloqué", delivered: "Remis" };
  return <>
    <dl className={styles.crmStats}>
      <div className={styles.crmStat}><dt>Commandes payées</dt><dd>{sales?.paid_orders ?? 0}</dd></div>
      <div className={styles.crmStat}><dt>Chiffre d’affaires validé</dt><dd>{formatEuros(total)}</dd></div>
    </dl>
    <h2>Cadeaux</h2>
    {gifts.length ? <ul className={styles.trips}>
      {giftProgress(gifts, total).map(gift => <li key={gift.id ?? gift.threshold_cents}>
        <strong>{gift.label}</strong> · {formatEuros(gift.threshold_cents)} · {labels[gift.state]}
        {gift.state === "pending" && <span> · Encore {formatEuros(gift.remaining)}</span>}
        {session && gift.state !== "delivered" && <form action={manageGift} className={styles.form}>
          <input type="hidden" name="session_id" value={session.id} />
          <input type="hidden" name="gift_id" value={gift.id} />
          {gift.state === "available" && <button name="operation" value="deliver">Marquer remis</button>}
          <button name="operation" value="remove">Retirer le palier</button>
        </form>}
      </li>)}
    </ul> : <p>Aucun palier de cadeau configuré.</p>}
  </>;
}
