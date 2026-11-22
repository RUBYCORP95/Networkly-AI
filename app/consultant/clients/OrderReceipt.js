import { lineTotal, savedOrderTotals } from "../../../lib/crm/order-pricing.mjs";
import { giftLine, itemDiscountText, discountText, orderStatuses, paymentStatuses, orderDate, receiptDate, receiptNumber, sellerFields } from "../../../lib/crm/order-receipt.mjs";
import { formatEuros } from "../../../lib/crm/money.mjs";
import styles from "../consultant.module.css";

export function SellerDetails({ seller }) {
  const fields = sellerFields.filter(([key]) => seller?.[key]);
  return fields.length > 0 ? <dl className={styles.receiptMeta}>
    {fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{seller[key]}</dd></div>)}
  </dl> : <p>Coordonnées professionnelles non renseignées.</p>;
}

export default function OrderReceipt({ order }) {
  const amounts = savedOrderTotals(order);
  const total = amounts.total === null ? "À confirmer" : formatEuros(amounts.total);
  return <>
    <header className={styles.receiptHeader}>
      <div><strong>Bon {receiptNumber(order)}</strong><br /><time dateTime={orderDate(order)}>{receiptDate(order)}</time></div>
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
            <div>{item.quantity} × {formatEuros(item.unit_cents)}</div>
            {item.discount && <div>{itemDiscountText(item)}</div>}</div>
          <strong>{formatEuros(lineTotal(item))}{lineTotal(item) === 0 && <> · Offert</>}</strong>
        </li>)}</ul> : <p style={{ whiteSpace: "pre-wrap" }}>{order.details}</p>}
      </section>
      {giftLine(order) && <p><strong>{giftLine(order)}</strong></p>}
      <dl className={styles.receiptTotals}>
        <div><dt>Sous-total produits</dt><dd>{amounts.subtotal === null ? "À confirmer" : formatEuros(amounts.subtotal)}</dd></div>
        {order.order_discount && <div><dt>Remise globale</dt><dd>{discountText(order.order_discount, amounts.savings)}</dd></div>}
        <div><dt>Livraison</dt><dd>{formatEuros(order.shipping_cents)}</dd></div>
        <div><dt>Total</dt><dd><strong>{total}</strong></dd></div>
      </dl>
    </details>
  </>;
}
