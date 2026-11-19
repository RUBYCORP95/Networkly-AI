import Link from "next/link";
import styles from "../consultant.module.css";

export default function CustomerList({ customers, demo = false }) {
  return <section aria-labelledby="customer-list-title">
    <h2 id="customer-list-title">Fichier clients</h2>
    {customers.length === 0 ? <p>Aucune fiche client.</p> : <div className={styles.cards}>
      {customers.map(customer => <Link href={demo ? "#fiche-client" : "?client=" + customer.id}
        className={styles.card} key={customer.id}>{customer.name}</Link>)}
    </div>}
  </section>;
}
