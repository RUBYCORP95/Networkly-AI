import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveUser } from "../../lib/auth/active-user";
import { createServerSupabase } from "../../lib/supabase/server";
import styles from "../consultant/consultant.module.css";

const path = "/demande-consultant";

async function submit(form) {
  "use server";
  const db = await createServerSupabase();
  const access = await requireActiveUser(db);
  if (!access.ok) redirect(access.status === 401 ? "/login?next=" + path : "/");
  const code = String(form.get("code") ?? "").trim();
  const sponsor = String(form.get("sponsor") ?? "").trim();
  const firstName = String(form.get("first_name") ?? "").trim();
  const lastName = String(form.get("last_name") ?? "").trim();
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80 || sponsor.length < 2 || sponsor.length > 100 || code.length < 2 || code.length > 100) redirect(path + "?result=invalid");
  const { error } = await db.rpc("request_my_lead_team_access", { p_consultant_identifier: code, p_sponsor_code: sponsor, p_applicant_name: firstName + " " + lastName });
  redirect(error ? path + "?result=error" : path);
}

export default async function RequestConsultant({ searchParams }) {
  const db = await createServerSupabase();
  const access = await requireActiveUser(db);
  if (!access.ok) redirect(access.status === 401 ? "/login?next=" + path : "/");
  const { data, error } = await db.from("lead_team_memberships").select("status,consultant_identifier,sponsor_code")
    .eq("user_id", access.user.id).maybeSingle();
  const { result } = await searchParams;
  const approved = data?.status === "verified" || access.profile.is_admin;
  return <main className={styles.page}>
    <Link href="/">← Tableau de bord</Link>
    <h1>Accès consultant CHOGAN</h1>
    <section className={styles.panel}>
      {approved ? <p>Ton accès est activé. <Link href="/consultant">Ouvrir l’espace consultant</Link></p>
      : error ? <p role="alert">Impossible de charger la demande. Réessaie dans un instant.</p>
      : data?.status === "pending" && data.sponsor_code ? <p role="status">Demande en attente de validation pour le code <strong>{data.consultant_identifier}</strong>.</p>
      : <>
        {data?.status === "rejected" && <p>Ta dernière demande a été refusée. Vérifie ton identifiant avant de renvoyer une demande.</p>}
        <p>Renseigne ton identifiant CHOGAN. Un administrateur doit valider ta demande pour activer tes outils consultant et tes quotas gratuits.</p>
        {result && <p role="alert">{result === "invalid" ? "Vérifie ton identifiant et ton code sponsor CHOGAN." : "L’envoi a échoué. Réessaie dans un instant."}</p>}
        <form action={submit} className={styles.form}>
          <label>Prénom<input name="first_name" autoComplete="given-name" maxLength={80} required /></label>
          <label>Nom<input name="last_name" autoComplete="family-name" maxLength={80} required /></label>
          <label>Identifiant consultant CHOGAN<input name="code" defaultValue={data?.consultant_identifier} minLength={2} maxLength={100} required /></label>
          <label>Code sponsor CHOGAN<input name="sponsor" defaultValue={data?.sponsor_code} minLength={2} maxLength={100} required /></label>
          <button>Envoyer ma demande</button>
        </form>
      </>}
    </section>
  </main>;
}
