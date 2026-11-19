import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import styles from "../consultant.module.css";
import { validDate } from "../mallettes/dates";
import { cancelAppointment, scheduleAppointment } from "./actions";

export const metadata = { title: "Calendrier des rendez-vous · TESAMI" };

const notices = new Map([
  ["saved", "Rendez-vous ajouté à ton calendrier."],
  ["cancelled", "Rendez-vous annulé."],
  ["invalid", "Vérifie le titre, la date et les horaires."],
  ["lead", "Ce lead n’est plus attribué à ton compte. Tu peux ajouter le rendez-vous depuis ton calendrier."],
  ["error", "L’opération a échoué. Réessaie dans un instant."],
]);
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function AppointmentsPage({ searchParams }) {
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const month = typeof params.month === "string" && validDate(params.month + "-01")
    ? params.month : today.slice(0, 7);
  const date = new Date(month + "-01");
  const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const client = await createServerSupabase();
  const [appointments, leads] = await Promise.all([
    client.from("consultant_appointments").select("id,title,place,day,starts_at,ends_at,lead_allocation_id")
      .eq("cancelled", false).gte("day", month + "-01").lte("day", month + "-" + days).order("day").order("starts_at"),
    typeof params.lead === "string" ? client.rpc("my_lead_allocation_cards") : Promise.resolve({ data: [] }),
  ]);
  const lead = leads.data?.find(card => card.allocation_id === params.lead);
  const items = appointments.data ?? [];
  const notice = notices.get(params.status);
  return (
    <main className={styles.page}>
      <Link href="/consultant">← Espace Consultant</Link>
      <h1>Calendrier des rendez-vous</h1>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {appointments.error ? <p role="alert">Le calendrier est temporairement indisponible.</p> : <>
        <section id="nouveau">
          <h2>Nouveau rendez-vous</h2>
          {lead && <p>Rendez-vous lié à un lead LeadFactory{lead.city ? " · " + lead.city : ""}.</p>}
          {params.lead && !lead && <p role="status">Ce lead est indisponible. Tu peux enregistrer le rendez-vous dans ton agenda.</p>}
          <form action={scheduleAppointment} className={styles.form}>
            {lead && <input type="hidden" name="lead" value={lead.allocation_id} />}
            <label>Titre<input name="title" maxLength={100} required /></label>
            <label>Date<input name="day" type="date" defaultValue={today.startsWith(month) ? today : month + "-01"} required /></label>
            <label>Début<input name="starts_at" type="time" required /></label>
            <label>Fin<input name="ends_at" type="time" required /></label>
            <label>Lieu ou lien visio<input name="place" maxLength={240} /></label>
            <button>Enregistrer</button>
          </form>
        </section>
        <section>
          <h2>{monthFormat.format(date)}</h2>
          <form className={styles.form}>
            <label>Mois affiché<input name="month" type="month" defaultValue={month} required /></label>
            <button>Afficher</button>
          </form>
          <div className={styles.calendar}>
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div className={styles.weekday} key={day}>{day}</div>)}
            {Array.from({ length: (date.getUTCDay() + 6) % 7 }, (_, index) => <div key={"empty-" + index} aria-hidden="true" />)}
            {Array.from({ length: days }, (_, index) => {
              const day = month + "-" + String(index + 1).padStart(2, "0");
              const count = items.filter(item => item.day === day).length;
              return <div key={day} className={styles.day + (count ? " " + styles.busy : "")}>
                <time dateTime={day}>{index + 1}</time>
                {count > 0 && <small><a href={"#rdv-" + day} aria-label={count + " rendez-vous"}>{count} RDV</a></small>}
              </div>;
            })}
          </div>
          <h2>Rendez-vous du mois</h2>
          {items.length === 0 ? <p>Aucun rendez-vous prévu ce mois-ci.</p> : <ul className={styles.trips}>
            {items.map((item, index) => <li id={items[index - 1]?.day !== item.day ? "rdv-" + item.day : undefined} key={item.id} className={styles.panel}>
              <strong>{item.title}</strong>
              <div>{item.day.split("-").reverse().join("/")} · {item.starts_at.slice(0, 5)}–{item.ends_at.slice(0, 5)}{item.lead_allocation_id ? " · LeadFactory" : ""}</div>
              {item.place && <div>{item.place}</div>}
              <form action={cancelAppointment}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="day" value={item.day} />
                <button aria-label={"Annuler " + item.title}>Annuler ce rendez-vous</button>
              </form>
            </li>)}
          </ul>}
        </section>
      </>}
    </main>
  );
}
