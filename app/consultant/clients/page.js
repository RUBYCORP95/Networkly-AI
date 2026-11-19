import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import { formatDate, nextBirthday, parisDate } from "../../../lib/crm/dates.mjs";
import { addFollowup, saveClient, updateFollowup } from "./actions";
import styles from "../consultant.module.css";

const notices = new Map([
  ["invalid", "Vérifie les informations saisies."],
  ["error", "L’opération a échoué. Réessaie dans un instant."],
  ["client", "Fiche client enregistrée."],
  ["followup", "Relance programmée."],
  ["updated", "Relance mise à jour."],
]);

function CustomerForm({ customer, today }) {
  return <form action={saveClient} className={styles.form}>
    {customer && <input type="hidden" name="id" value={customer.id} />}
    <label>Nom<input name="name" maxLength={120} defaultValue={customer?.name} required /></label>
    <label>E-mail<input name="email" type="email" maxLength={254} defaultValue={customer?.email ?? ""} /></label>
    <label>Téléphone<input name="phone" type="tel" maxLength={40} defaultValue={customer?.phone ?? ""} /></label>
    <label>Date de naissance<input name="birth_date" type="date" max={today} defaultValue={customer?.birth_date ?? ""} /></label>
    <label>Notification annuelle d’anniversaire<input type="checkbox" name="birthday_notification" defaultChecked={customer?.birthday_notification ?? false} /></label>
    <button>{customer ? "Enregistrer" : "Ajouter le client"}</button>
  </form>;
}

function FollowupTable({ title, rows, today }) {
  return <section>
    <h2>{title}</h2>
    {rows.length === 0 ? <p>Aucun rappel.</p> : <ul className={styles.trips}>
      {rows.map(item => <li className={styles.panel} key={item.id}>
        <Link href={"?client=" + item.client_id + "#fiche"}>{item.name}</Link>
        <p>{item.birthday ? "Anniversaire" : "Relance"} · {formatDate(item.date)}
          {item.notification && item.date <= today && <strong> · Notification TESAMI</strong>}
          {!item.notification && " · Notification désactivée"}</p>
        {!item.birthday && <form action={updateFollowup} className={styles.form}>
          <input type="hidden" name="id" value={item.id} />
          <button name="operation" value="complete">Marquer comme effectuée</button>
          <button name="operation" value={item.notification ? "disable" : "enable"}>
            {item.notification ? "Désactiver la notification" : "Activer la notification"}
          </button>
        </form>}
      </li>)}
    </ul>}
  </section>;
}

export const metadata = { title: "Mes clients et rappels · TESAMI" };

export default async function ClientsPage({ searchParams }) {
  const params = await searchParams;
  const today = parisDate();
  const db = await createServerSupabase();
  const [customers, reminders] = await Promise.all([
    db.from("crm_clients").select("id,name,email,phone,birth_date,birthday_notification").order("name"),
    db.from("crm_followups").select("id,client_id,due_date,notification,completed_at").order("due_date"),
  ]);
  const clients = customers.data ?? [];
  const names = new Map(clients.map(customer => [customer.id, customer.name]));
  const selected = clients.find(customer => customer.id === params.client);
  const active = (reminders.data ?? []).filter(item => !item.completed_at && names.has(item.client_id))
    .map(item => ({...item, name: names.get(item.client_id), date: item.due_date}));
  const birthdays = clients.filter(customer => customer.birth_date)
    .map(customer => ({ id: "birthday-" + customer.id, client_id: customer.id, name: customer.name,
      date: nextBirthday(customer.birth_date, today), birthday: true, notification: customer.birthday_notification }));
  const rows = [...active, ...birthdays].sort((a, b) => a.date.localeCompare(b.date));
  const dueNotifications = rows.filter(item => item.notification && item.date <= today).length;

  return <main className={styles.page}>
    <Link href="/consultant">← Espace Consultant</Link>
    <h1>Mes clients et rappels</h1>
    {notices.has(params.result) && <p className={styles.notice} role="status">{notices.get(params.result)}</p>}
    {customers.error || reminders.error ? <p role="alert">Le CRM est temporairement indisponible.</p> : <>
      {dueNotifications > 0 && <p className={styles.notice} role="status">{dueNotifications} notification(s) TESAMI à consulter.</p>}
      <FollowupTable title="En retard" rows={rows.filter(item => item.date < today)} today={today} />
      <FollowupTable title="Aujourd’hui" rows={rows.filter(item => item.date === today)} today={today} />
      <FollowupTable title="À venir" rows={rows.filter(item => item.date > today)} today={today} />
      <section>
        <h2>Fichier clients</h2>
        {clients.length === 0 ? <p>Aucune fiche client.</p> : <div className={styles.cards}>
          {clients.map(customer => <Link href={"?client=" + customer.id + "#fiche"} className={styles.card} key={customer.id}>{customer.name}</Link>)}
        </div>}
      </section>
      {selected && <section id="fiche" key={selected.id}>
        <h2>{selected.name}</h2>
        <CustomerForm customer={selected} today={today} />
        <h2>Programmer une relance</h2>
        <form className={styles.form} action={addFollowup}>
          <input type="hidden" name="client_id" value={selected.id} />
          <label>Délai à partir d’aujourd’hui (jours)<input type="number" name="delay_days" min={1} max={3650} required /></label>
          <label>Notification dans TESAMI<input type="checkbox" name="notification" /></label>
          <button>Programmer</button>
        </form>
        <h2>Relances effectuées</h2>
        <ul>{reminders.data.filter(item => item.client_id === selected.id && item.completed_at)
          .map(item => <li key={item.id}>Relance du {formatDate(item.due_date)} · effectuée le {formatDate(parisDate(new Date(item.completed_at)))}</li>)}</ul>
      </section>}
      <section>
        <h2>Ajouter un client</h2>
        <CustomerForm today={today} />
      </section>
    </>}
  </main>;
}
