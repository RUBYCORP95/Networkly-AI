"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { categories } from "../../../lib/public-catalogue/model.mjs";
import styles from "./catalogue.module.css";

export default function ProductDetails({ product, onClose, onAdd, quantity, busy }) {
  const dialog = useRef(null);

  useEffect(() => {
    if (product && !dialog.current.open) dialog.current.showModal();
  }, [product]);

  return <dialog ref={dialog} className={styles.dialog} onClose={onClose} aria-labelledby="catalogue-product-title">
    {product && <>
      <button type="button" className={styles.close} aria-label="Fermer la fiche"
        onClick={() => dialog.current.close()}><X size={21} aria-hidden="true" /></button>
      <div className={styles.dialogImage}>
        <img src={product.photo_url} alt={product.photo_alt || product.title} referrerPolicy="no-referrer" />
      </div>
      <div className={styles.dialogBody}>
        <p className={styles.kicker}>{categories[product.category]} · {product.reference}</p>
        <h2 id="catalogue-product-title">{product.title}</h2>
        {product.format && <p>{product.format}</p>}
        {product.description && <p className={styles.description}>{product.description}</p>}
        {product.notes && <div>
          <h3>Notes olfactives</h3>
          <p className={styles.description}>{product.notes}</p>
        </div>}
        <div className={styles.row}>
          <strong>{formatEuros(product.unit_cents)}</strong>
          {product.available ? <button type="button" disabled={busy || quantity >= 999}
            onClick={onAdd}>{quantity ? "Ajouter au panier (" + quantity + ")" : "Ajouter au panier"}</button> :
            <span>Indisponible</span>}
        </div>
      </div>
    </>}
  </dialog>;
}
