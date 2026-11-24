import Link from "next/link";
import { ArrowUpRight, Gift } from "lucide-react";
import { getMerchProducts, merchCollection } from "../../../lib/crm/catalogue";
import snapshot from "../../../lib/crm/merch-snapshot.json";
import consultantStyles from "../consultant.module.css";
import styles from "./merch.module.css";

export const metadata = { title: "Merch · Objets personnalisables · TESAMI" };

export default async function MerchPage() {
  let products;
  let usingSnapshot = false;
  try {
    products = await getMerchProducts();
  } catch (error) {
    console.error("Chargement de la collection Merch impossible", error.message);
    products = snapshot;
    usingSnapshot = true;
  }

  return (
    <main className={consultantStyles.page}>
      <Link href="/consultant">← Espace Consultant</Link>
      <div className={styles.intro}>
        <h1>Merch</h1>
        <p>Tous les produits de cette collection sont personnalisables. Selon l’article, ajoute ton logo, ton prénom ou ta photo sur la fiche produit de Parfum Inspiration.</p>
      </div>
      {usingSnapshot && (
        <p className={consultantStyles.notice}>
          Dernière collection enregistrée. <a href={merchCollection} target="_blank" rel="noopener noreferrer">Voir la collection actuelle sur Parfum Inspiration</a>.
        </p>
      )}
      {products.length ? (
        <ul className={styles.catalog}>
          {products.map(product => (
            <li key={product.handle}>
              <a className={styles.product} href={product.href} target="_blank" rel="noopener noreferrer">
                <div className={styles.image}>
                  {product.image ? <img src={product.image} alt="" loading="lazy" decoding="async" /> : <Gift size={32} aria-hidden="true" />}
                </div>
                <span className={styles.title}>{product.title}</span>
                <span className={styles.cta}>Voir et personnaliser <ArrowUpRight size={16} aria-hidden="true" /></span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className={consultantStyles.notice}>
          <p>Aucun article dans la collection pour le moment.</p>
          <a href={merchCollection} target="_blank" rel="noopener noreferrer">Ouvrir la collection sur Parfum Inspiration</a>
        </div>
      )}
    </main>
  );
}
