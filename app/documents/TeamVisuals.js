import { Users } from "lucide-react";
import TeamVisualUpload from "./TeamVisualUpload";
import styles from "../consultant/consultant.module.css";

export default async function TeamVisuals({ supabase, isAdmin }) {
  const bucket = supabase.storage.from("team-visuals");
  const { data, error } = await bucket.list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const names = (data ?? []).filter(item => item.id).map(item => item.name);
  const { data: images, error: signingError } = names.length
    ? await bucket.createSignedUrls(names, 900) : { data: [] };

  return (
    <section className={styles.teamVisuals} aria-labelledby="team-visuals-title">
      <header className={styles.teamBanner}>
        <Users size={30} aria-hidden="true" />
        <h2 id="team-visuals-title">Visuels de la Team Chogan</h2>
      </header>
      {error || signingError ? <p role="alert">Les visuels sont temporairement indisponibles.</p> :
        images.some(image => image.signedUrl) ? <div className={styles.cards}>
          {images.filter(image => image.signedUrl).map(image => {
            const title = image.path.split("_").at(-1).split(".")[0].replaceAll("-", " ");
            return <a className={styles.card} href={image.signedUrl} target="_blank" rel="noreferrer" key={image.path}>
              <img className={styles.teamImage} src={image.signedUrl} alt="" loading="lazy" />
              <strong>{title}</strong>
            </a>;
          })}
        </div> : <p>Aucun visuel d’équipe pour le moment.</p>}
      {isAdmin && <TeamVisualUpload />}
    </section>
  );
}
