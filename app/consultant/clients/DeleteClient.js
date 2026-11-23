"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { deleteClient } from "./actions";
import styles from "../consultant.module.css";

function ConfirmationButtons({ close }) {
  const { pending } = useFormStatus();
  return <div className={styles.crmDeleteActions}>
    <button type="button" className={styles.crmAction} onClick={close} disabled={pending} autoFocus>Annuler</button>
    <button type="submit" className={styles.crmDeleteButton} disabled={pending}>
      {pending ? "Suppression…" : "Confirmer la suppression"}
    </button>
  </div>;
}

export default function DeleteClient({ customer, detail, adminSearch, owner }) {
  const dialog = useRef(null);
  const titleId = useId();

  return <>
    <button type="button" className={styles.crmDeleteButton} aria-label={"Supprimer " + customer.name}
      onClick={() => dialog.current.showModal()}>
      <Trash2 size={17} aria-hidden="true" /> Supprimer
    </button>
    <dialog ref={dialog} className={styles.crmDeleteDialog} aria-labelledby={titleId}>
      <form action={deleteClient}>
        <input type="hidden" name="id" value={customer.id} />
        {detail && <input type="hidden" name="from" value="detail" />}
        {adminSearch !== undefined && <>
          <input type="hidden" name="view" value="manage" />
          <input type="hidden" name="q" value={adminSearch} />
        </>}
        <h2 id={titleId}>Supprimer {customer.name} ?</h2>
        {owner && <p>Consultant · {owner}</p>}
        <p>La fiche sera retirée des clients actifs et des rappels. Les factures et les commandes resteront accessibles.</p>
        <ConfirmationButtons close={() => dialog.current.close()} />
      </form>
    </dialog>
  </>;
}
