import { orderStatuses, paymentStatuses, receiptDate, receiptNumber, sellerFields } from "../../../lib/crm/order-receipt.mjs";
import { formatEuros } from "../../../lib/crm/money.mjs";
import styles from "../consultant.module.css";

export function SellerDetails({ seller }) {
  const fields = sellerFields.filter(([key]) => seller?.[key]);
  return fields.length > 0 ? <dl className={styles.receiptMeta}>
    {fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{seller[key]}</dd></div>)}
  </dl> : <p>Coordonnées professionnelles non renseignées.</p>;
}

export default function OrderReceipt({ order }) {
  const total = order.total_cents === null ? "À confirmer" : formatEuros(order.total_cents + order.shipping_cents);
  return <>
    <header className={styles.receiptHeader}>
      <div><strong>Bon {receiptNumber(order.id)}</strong><br /><time dateTime={order.created_at}>{receiptDate(order)}</time></div>
      <strong>{total}</strong>
    </header>
    <p>Commande · {new Map(orderStatuses).get(order.status)} <br /> Paiement · {new Map(paymentStatuses).get(order.payment_status)}</p>
    <details className={styles.receiptDetails}>
      <summary className={styles.crmAction}>Consulter le bon de commande</summary>
      <section>
        <h3>Consultant</h3>
        <SellerDetails seller={order.seller} />
      </section>
      <section>
        <h3>Client</h3>
        <p>{order.buyer?.name || "Client non renseigné"}{order.buyer?.email && <><br />{order.buyer.email}</>}
          {order.buyer?.phone && <><br />{order.buyer.phone}</>}</p>
      </section>
      <section>
        <h3>Articles</h3>
        {order.items.length ? <ul className={styles.receiptLines}>{order.items.map(item => <li key={item.id}>
          <div><strong>{item.title}</strong><div>{[item.reference && "Réf. " + item.reference, item.format].filter(Boolean).join(" · ")}</div>
            <div>{item.quantity} × {formatEuros(item.unit_cents)}</div></div>
          <strong>{formatEuros(item.quantity * item.unit_cents)}</strong>
        </li>)}</ul> : <p style={{ whiteSpace: "pre-wrap" }}>{order.details}</p>}
      </section>
      <dl className={styles.receiptTotals}>
        <div><dt>Sous-total produits</dt><dd>{order.total_cents === null ? "À confirmer" : formatEuros(order.total_cents)}</dd></div>
        <div><dt>Livraison</dt><dd>{formatEuros(order.shipping_cents)}</dd></div>
        <div><dt>Total</dt><dd><strong>{total}</strong></dd></div>
      </dl>
    </details>
  </>;
}
