import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import styles from "../consultant.module.css";
import { addCase, bookTrip, cancelTrip, updateCase } from "./actions";
import { overlaps, validDate } from "./dates";

export const metadata = { title: "Mallettes voyageuses · TESAMI" };

const notices = new Map([
  ["archive", "Mallette retirée du parc actif. Son historique est conservé."],
  ["restore", "Mallette réactivée."],
  ["rename", "Nom de la mallette mis à jour."],
  ["size", "Taille de la mallette mise à jour."],
  ["inactive", "Cette mallette est archivée ou indisponible."],
  ["added", "Mallette ajoutée."],
  ["booked", "Déplacement enregistré."],
  ["cancelled", "Déplacement annulé. La mallette est libérée pour cette période."],
  ["overlap", "Cette mallette est déjà réservée pendant tout ou partie de cette période."],
  ["invalid", "Vérifie les champs et l’ordre des dates."],
  ["error", "L’opération a échoué. Réessaie dans un instant."],
]);
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const sizes = { small: "Petite", large: "Grande" };

function CaseSize({ size }) {
  return <select name="size" defaultValue={size ?? ""} required>
    <option value="" disabled>Choisir une taille</option>
    {Object.entries(sizes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
  </select>;
}

function CaseFields({ id, from, to }) {
  return <>
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="from" value={from} />
    <input type="hidden" name="to" value={to} />
  </>;
}

function formatDate(date) {
  return date.split("-").reverse().join("/");
}

export default async function MallettesPage({ searchParams }) {
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) &&
    validDate(params.month + "-01") ? params.month : today.slice(0, 7);
  const first = month + "-01";
  const monthDate = new Date(first);
  const days = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const last = month + "-" + days;
  const hasPeriod = validDate(params.from) && validDate(params.to) && params.from <= params.to;
  const from = hasPeriod ? params.from : month === today.slice(0, 7) ? today : first;
  const to = hasPeriod ? params.to : from;
  const client = await createServerSupabase();
  const fetchTrips = (start, end) => client.from("travelling_case_trips")
    .select("id,case_id,destination,starts_on,ends_on").eq("cancelled", false)
    .lte("starts_on", end).gte("ends_on", start).order("starts_on").order("id");
  const [casesResult, monthResult, periodResult] = await Promise.all([
    client.from("travelling_cases").select("id,name,size,archived_at").order("name").order("id"),
    fetchTrips(first, last),
    fetchTrips(from, to),
  ]);
  const failed = casesResult.error || monthResult.error || periodResult.error;
  const allCases = casesResult.data ?? [];
  const cases = allCases.filter(item => !item.archived_at);
  const archivedCases = allCases.filter(item => item.archived_at);
  const activeIds = new Set(cases.map(item => item.id));
  const trips = monthResult.data ?? [];
  const caseNames = new Map(allCases.map((item, index) => [item.id,
    allCases.some(other => other.id !== item.id && other.name === item.name)
      ? `${item.name} · Mallette ${index + 1}` : item.name]));
  const caseLabel = item => caseNames.get(item.id) + (item.size ? " · " + sizes[item.size] : "");
  const unavailable = new Set((periodResult.data ?? []).filter(trip => activeIds.has(trip.case_id)).map(trip => trip.case_id));
  const availableCases = cases.filter(item => !unavailable.has(item.id));
  const notice = notices.get(params.status);

  return (
    <main className={styles.page}>
      <Link href="/consultant">← Espace Consultant</Link>
      <h1>Mallettes voyageuses</h1>
      <p className={styles.muted}>Suis les déplacements de tes mallettes et vérifie lesquelles sont disponibles.</p>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {failed ? <p role="alert">Le planning est temporairement indisponible.</p> : <>
        <section>
          <h2>Disponibilité par mallette</h2>
          <form className={styles.form}>
            <label>Mois affiché<input name="month" type="month" defaultValue={month} required /></label>
            <label>Du<input name="from" type="date" defaultValue={from} required /></label>
            <label>Au<input name="to" type="date" defaultValue={to} required /></label>
            <button>Afficher</button>
          </form>
          {(params.from || params.to) && !hasPeriod && <p role="alert">Choisis une période valide.</p>}
          <p>{availableCases.length} sur {cases.length} disponible(s) pendant toute la période du {formatDate(from)} au {formatDate(to)} inclus.</p>
          <div className={styles.cards}>
            {cases.map(item => <div className={styles.card} key={item.id}>
              <strong>{caseLabel(item)}</strong>
              <span>{unavailable.has(item.id) ? "Indisponible sur cette période" : "Disponible sur cette période"}</span>
              <form action={updateCase} className={styles.form}>
                <CaseFields id={item.id} from={from} to={to} />
                <label>Nom<input name="name" maxLength={80} defaultValue={item.name} /></label>
                <button name="operation" value="rename" formNoValidate>Renommer</button>
                <label>Taille<CaseSize size={item.size} /></label>
                <button name="operation" value="size">Enregistrer la taille</button>
              </form>
              <form action={updateCase}>
                <CaseFields id={item.id} from={from} to={to} />
                <button name="operation" value="archive" type="submit">Retirer du parc</button>
              </form>
            </div>)}
          </div>
        </section>
        <section>
          <h2>Calendrier · {monthFormat.format(monthDate)}</h2>
          <div className={styles.calendar}>
            {weekdays.map(day => <div className={styles.weekday} key={day}>{day}</div>)}
            {Array.from({ length: (monthDate.getUTCDay() + 6) % 7 }, (_, index) => <div key={"empty-" + index} aria-hidden="true" />)}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1;
              const date = month + "-" + String(day).padStart(2, "0");
              const count = new Set(trips.filter(trip => activeIds.has(trip.case_id) && overlaps(trip, date, date))
                .map(trip => trip.case_id)).size;
              const available = cases.length - count;
              return <div key={day} className={styles.day + (count ? " " + styles.busy : "")}>
                <time dateTime={date}>{day}</time>
                <div className={styles.caseDayCounts}>
                  <small className={styles.caseStatusFree}>{available} libre(s)</small>
                  <small className={styles.caseStatusBusy}>{count} réservée(s)</small>
                </div>
              </div>;
            })}
          </div>
          <h2>Déplacements du mois</h2>
          {trips.length === 0 ? <p>Aucun déplacement prévu ce mois-ci.</p> :
            <ul className={styles.trips}>
              {trips.map(trip => <li key={trip.id} className={styles.panel}>
                <strong>{caseNames.get(trip.case_id)} · {trip.destination}</strong>
                <div>Du {formatDate(trip.starts_on)} au {formatDate(trip.ends_on)} inclus</div>
                <form action={cancelTrip}>
                  <input type="hidden" name="id" value={trip.id} />
                  <input type="hidden" name="from" value={from} />
                  <input type="hidden" name="to" value={to} />
                  <button aria-label={"Annuler le déplacement vers " + trip.destination}>Annuler ce déplacement</button>
                </form>
              </li>)}
            </ul>}
        </section>
        <section>
          <h2>Ajouter une mallette</h2>
          <form action={addCase} className={styles.form}>
            <label>Nom de la mallette<input name="name" maxLength={80} required /></label>
            <label>Taille<CaseSize /></label>
            <button>Ajouter</button>
          </form>
        </section>
        {cases.length > 0 && <section>
          <h2>Planifier un déplacement</h2>
          <form action={bookTrip} className={styles.form}>
            <label>Mallette<select name="case_id" required>
              {cases.map(item => <option key={item.id} value={item.id}>{caseLabel(item)}</option>)}
            </select></label>
            <label>Destination<input name="destination" maxLength={160} required /></label>
            <label>Date de départ<input name="starts_on" type="date" defaultValue={from} required /></label>
            <label>Date de retour<input name="ends_on" type="date" defaultValue={to} required /></label>
            <button>Réserver</button>
          </form>
        </section>}
        {archivedCases.length > 0 && <details className={styles.panel}>
          <summary>Mallettes archivées ({archivedCases.length})</summary>
          <ul className={styles.trips}>{archivedCases.map(item => <li key={item.id}>
            <strong>{caseLabel(item)}</strong>
            <form action={updateCase} className={styles.form}>
              <CaseFields id={item.id} from={from} to={to} />
              <button name="operation" value="restore">Réactiver</button>
            </form>
          </li>)}</ul>
        </details>}
        <section className={styles.panel} aria-labelledby="available-cases-title">
          <h2 id="available-cases-title">Mallettes disponibles · {availableCases.length} sur {cases.length}</h2>
          <p>Du {formatDate(from)} au {formatDate(to)} inclus.</p>
          {availableCases.length === 0 ? <p>Aucune mallette n’est libre pendant toute cette période.</p> :
            <ul className={styles.trips}>{availableCases.map(item => <li key={item.id}>
              <form action={updateCase} className={styles.form}>
                <CaseFields id={item.id} from={from} to={to} />
                <strong>{caseLabel(item)}</strong>
                <button name="operation" value="archive" aria-label={"Retirer " + caseLabel(item) + " du parc"}>Retirer du parc</button>
              </form>
            </li>)}</ul>}
        </section>
      </>}
    </main>
  );
}
