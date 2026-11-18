"use client";

import { useActionState } from "react";
import { audiences, levels } from "../../../lib/parfums/expert.mjs";
import styles from "../../expert-parfums/parfums.module.css";
import { savePerfume } from "./actions";

export default function PerfumeForm({ perfume }) {
  const [state, save, pending] = useActionState(savePerfume, {});
  return <form key={perfume?.reference ?? "new"} action={save} className={styles.card}>
    <h2>{perfume ? `Modifier ${perfume.reference}` : "Ajouter une fiche"}</h2>
    <input type="hidden" name="edition" value={perfume?.reference ?? ""} />
    <fieldset disabled={pending}>
      <label className={styles.field}>Référence<input name="reference" required maxLength={24} defaultValue={perfume?.reference} readOnly={Boolean(perfume)} /></label>
      <label className={styles.field}>Nom Olfazeta<input name="nom" required maxLength={120} defaultValue={perfume?.nom} /></label>
      <label className={styles.field}>Parfum porté correspondant (facultatif)<input name="inspiration" maxLength={160} defaultValue={perfume?.inspiration} /></label>
      <label className={styles.field}>Public<select name="public_cible" defaultValue={perfume?.public_cible ?? "mixte"}>
        {Object.entries(audiences).filter(([key]) => key !== "tous").map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className={styles.field}>Famille<input name="famille" required maxLength={120} defaultValue={perfume?.famille} /></label>
      {Object.entries(levels).map(([stage, label]) =>
        <label key={stage} className={styles.field}>{label} · une note par ligne
          <textarea rows={3} name={stage} defaultValue={perfume?.[stage].join("\n")} /></label>)}
      <label className={styles.field}>Lien de la source<input name="source" type="url" required maxLength={1500} defaultValue={perfume?.source} /></label>
      <label className={styles.field}>Page de la source (facultatif)<input name="source_page" type="number" min={1} max={10000} defaultValue={perfume?.source_page ?? ""} /></label>
      <p><label><input name="publie" type="checkbox" defaultChecked={perfume?.publie} /> Publier la fiche dans le catalogue</label></p>
      <button className={styles.primary} type="submit">{pending ? "Enregistrement…" : "Enregistrer"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.success && <p role="status">{state.success}</p>}
  </form>;
}
