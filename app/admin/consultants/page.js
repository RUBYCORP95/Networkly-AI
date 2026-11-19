import Link from "next/link";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { requireConsultantAdmin } from "./access";
import Decision from "./Decision";
import styles from "../../consultant/consultant.module.css";

const statuses = { pending: "En attente", verified: "Validée", rejected: "Refusée", revoked: "Révoquée" };
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
const notices = { saved: "Décision enregistrée.", stale: "Cette demande a changé depuis son affichage. Vérifie son statut.", error: "La décision n’a pas été enregistrée.", invalid: "La confirmation est invalide." };

export default async function ConsultantReview({ searchParams }) {
  await requireConsultantAdmin();
  const params = await searchParams;
  const history = params.view === "history";
  const filter = params.status === "all" ? "all" : "pending";
  const n = Number(params.page);
  const page = Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 1;
  const size = 40;
  const db = createAdminSupabase();
  let query = history
    ? db.from("lead_team_decisions").select("id,user_id,consultant_identifier,sponsor_code,applicant_name,decision,decided_at,admin_id", { count: "exact" }).order("decided_at", { ascending: false }).order("id")
    : db.from("lead_team_memberships").select("user_id,consultant_identifier,sponsor_code,applicant_name,status,created_at,updated_at", { count: "exact" }).order("updated_at", { ascending: false }).order("user_id");
  if (!history && filter === "pending") query = query.eq("status", "pending");
  const pendingQuery = db.from("lead_team_memberships").select("user_id", { count: "exact", head: true }).eq("status", "pending");
  const [{ data, error, count }, pending] = await Promise.all([query.range((page - 1) * size, page * size - 1), pendingQuery]);
  const pendingCount = pending.error ? "" : " (" + pending.count + ")";
  const rows = data ?? [];
  const identities = await Promise.all([...new Set(rows.flatMap(row => [row.user_id, row.admin_id].filter(Boolean)))].map(async id => {
    const { data } = await db.auth.admin.getUserById(id);
    const { data: profile } = await db.from("profiles").select("full_name").eq("id", id).maybeSingle();
    return [id, { name: profile?.full_name, email: data?.user?.email }];
  }));
  const names = new Map(identities);
  const identity = (id, declaredName) => {
    const person = names.get(id);
    const name = declaredName || person?.name;
    return name ? <>{name}<br />{person?.email}</> : person?.email || id;
  };
  const pageLink = number => "?" + new URLSearchParams({ view: history ? "history" : "requests", status: filter, page: number });
  return <main className={styles.page}>
    <Link href="/admin">← Administration</Link>
    <h1>Validation des consultants</h1>
    <nav className={styles.orderNavigation} aria-label="Demandes consultant">
      <Link className={styles.crmAction} href="?status=pending" aria-current={!history && filter === "pending" ? "page" : undefined}>En attente{pendingCount}</Link>
      <Link className={styles.crmAction} href="?status=all" aria-current={!history && filter === "all" ? "page" : undefined}>Toutes les demandes</Link>
      <Link className={styles.crmAction} href="?view=history" aria-current={history ? "page" : undefined}>Historique des décisions</Link>
    </nav>
    {Object.hasOwn(notices, params.result) && <p role="status">{notices[params.result]}</p>}
    <section className={styles.panel}>
      {error ? <p role="alert">Impossible de charger cette liste.</p> : !rows.length ? <p>{history ? "Aucune décision enregistrée." : "Aucune demande dans cette liste."}</p> :
        <div className="customertable"><table>
          <thead><tr><th>Nom et prénom</th><th>Identifiant CHOGAN</th><th>Code sponsor</th><th>Statut</th><th>{history ? "Date de décision" : "Date de demande"}</th><th>{history ? "Administrateur" : "Action"}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id ?? row.user_id}>
            <td>{identity(row.user_id, row.applicant_name)}</td><td>{row.consultant_identifier}</td><td>{row.sponsor_code ?? "Non renseigné"}</td>
            <td>{statuses[row.decision ?? row.status]}</td><td>{date.format(new Date(row.decided_at ?? row.created_at))}</td>
            <td>{history ? identity(row.admin_id) : row.status === "pending" ? <Decision request={row} /> : "—"}</td>
          </tr>)}</tbody>
        </table></div>}
      <nav className={styles.orderNavigation} aria-label="Pagination">
        {page > 1 && <Link href={pageLink(page - 1)}>Précédent</Link>}
        {page * size < count && <Link href={pageLink(page + 1)}>Suivant</Link>}
      </nav>
    </section>
  </main>;
}
