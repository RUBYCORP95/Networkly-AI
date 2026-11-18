import Link from "next/link";
import { audiences, levels, whatsappLink } from "../../lib/parfums/expert.mjs";
import styles from "./parfums.module.css";

export default function Fiche({ perfume, compact = false, result }) {
  return <article className={styles.card}>
    <small>OLFAZETA · RÉF. {perfume.reference}</small>
    <h2>{perfume.nom}</h2>
    <p>{audiences[perfume.public_cible]} · {perfume.famille}</p>
    {result && <div className={styles.match}>
      {result.direct && <p><strong>Correspondance du tableau fourni</strong></p>}
      <strong>{result.score} % de correspondance</strong>
      <p>{result.matches.map(({ note, stages }) => `${note} (${stages.map(stage => levels[stage].toLowerCase()).join(", ")})`).join(" · ")}</p>
      {result.missing.length > 0 && <p>Notes recherchées non relevées dans la source · {result.missing.join(", ")}</p>}
    </div>}
    {compact ? <Link href={`/expert-parfums/${perfume.reference}`}>Voir la pyramide →</Link> : <>
      <dl className={styles.pyramid}>{Object.entries(levels).map(([stage, label]) =>
        <div key={stage}><dt>{label}</dt><dd>{perfume[stage].join(" · ") || "Non documenté"}</dd></div>
      )}</dl>
      <p><a href={perfume.source} target="_blank" rel="noreferrer">Source des notes{perfume.source_page ? ` (page ${perfume.source_page})` : ""}</a></p>
    </>}
    <a className={styles.share} href={whatsappLink(perfume)} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
  </article>;
}
