import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import { formatDate, nextBirthday, parisDate } from "../../../lib/crm/dates.mjs";
import { addFollowup, saveClient, saveSeller, updateFollowup, updateOrder } from "./actions";
import { orderStatuses, paymentStatuses, sellerFields } from "../../../lib/crm/order-receipt.mjs";
import OrderReceipt from "./OrderReceipt";
import ShareOrder from "./ShareOrder";
import OrderForm from "./OrderForm";
import styles from "../consultant.module.css";

const notices = new Map([
  ["invalid", "Vérifie les informations saisies."],
  ["error", "L’opération a échoué. Réessaie dans un instant."],
  ["client", "Fiche client enregistrée."],
  ["followup", "Relance programmée."],
  ["catalogue", "Un produit ou un prix du catalogue est indisponible. Relance la recherche."],
  ["seller_required", "Enregistre d’abord tes coordonnées professionnelles."],
  ["seller", "Coordonnées professionnelles enregistrées."],
  ["order", "Commande enregistrée."],
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
        <Link href={"?client=" + item.client_id}>{item.name}</Link>
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

const emailStatuses = new Map([
  ["not_requested", "Récapitulatif prévu à la confirmation"],
  ["missing_email", "E-mail client manquant"],
  ["queued", "E-mail en file d’attente"], ["sending", "E-mail en cours d’envoi"],
  ["sent", "E-mail accepté par Brevo"], ["failed", "Échec de l’envoi de l’e-mail"],
]);

function SellerForm({ seller }) {
  return <section>
    <h2>Coordonnées sur les bons de commande</h2>
    <p>Ces coordonnées professionnelles seront visibles sur tes bons et dans les e-mails clients.</p>
    <form action={saveSeller} className={styles.form}>
      {sellerFields.map(([key, label, maxLength]) => <label key={key}>{label}
        {key === "address" ? <textarea name={key} maxLength={maxLength} defaultValue={seller?.[key]} /> :
          <input name={key} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
            required={key === "name" || key === "email"} maxLength={maxLength} defaultValue={seller?.[key]} />}
      </label>)}
      <button>Enregistrer mes coordonnées</button>
    </form>
  </section>;
}

function OrderHistory({ orders, clientId }) {
  return <section>
    <h2>Historique des commandes</h2>
    {orders.error ? <p role="alert">L’historique est temporairement indisponible.</p> : <>
      {orders.data.length === 0 ? <p>Aucune commande pour ce client.</p> : <ul className={styles.trips}>
        {orders.data.map(order => <li key={order.id} className={styles.panel}>
          <OrderReceipt order={order} />
          <p>{emailStatuses.get(order.email_state)}</p>
          <form action={updateOrder} className={styles.form}>
            <input name="id" type="hidden" value={order.id} />
            <label>Statut<select name="status" defaultValue={order.status}>
              {orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Paiement<select name="payment_status" defaultValue={order.payment_status}>
              {paymentStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" defaultValue={(order.shipping_cents / 100).toFixed(2)} /></label>
            <button>Mettre à jour</button>
          </form>
        </li>)}
      </ul>}
      <h2>Partager un bon de commande</h2>
      <ShareOrder key={clientId} clientId={clientId} />
      <h2>Ajouter une commande</h2>
      <OrderForm key={clientId} clientId={clientId} />
    </>}
  </section>;
}

export const metadata = { title: "Mes clients et rappels · TESAMI" };

export default async function ClientsPage({ searchParams }) {
  const params = await searchParams;
  const today = parisDate();
  const db = await createServerSupabase();
  const [customers, seller, reminders] = await Promise.all([
    db.from("crm_clients").select("id,name,email,phone,birth_date,birthday_notification").order("name"),
    db.from("crm_seller_profiles").select("name,business,email,phone,address,registration").maybeSingle(),
    db.from("crm_followups").select("id,client_id,due_date,notification,completed_at").order("due_date"),
  ]);
  const clients = customers.data ?? [];
  const names = new Map(clients.map(customer => [customer.id, customer.name]));
  const selected = clients.find(customer => customer.id === params.client);
  const orders = selected ? await db.from("crm_orders")
    .select("id,details,total_cents,shipping_cents,items,status,payment_status,created_at,buyer,seller,email_state").eq("client_id", selected.id)
    .order("created_at", { ascending: false }).order("id", { ascending: false }) : null;
  const active = (reminders.data ?? []).filter(item => !item.completed_at && names.has(item.client_id))
    .map(item => ({...item, name: names.get(item.client_id), date: item.due_date}));
  const birthdays = clients.filter(customer => customer.birth_date)
    .map(customer => ({ id: "birthday-" + customer.id, client_id: customer.id, name: customer.name,
      date: nextBirthday(customer.birth_date, today), birthday: true, notification: customer.birthday_notification }));
  const rows = [...active, ...birthdays].sort((a, b) => a.date.localeCompare(b.date));
  const dueNotifications = rows.filter(item => item.notification && item.date <= today).length;

  return <main className={styles.page}>
    <Link href="/consultant">← Espace Consultant</Link>
    <h1>{selected?.name ?? "Mes clients et rappels"}</h1>
    {selected && <p><Link href="/consultant/clients">← Tous les clients</Link></p>}
    {notices.has(params.result) && <p className={styles.notice} role="status">{notices.get(params.result)}</p>}
    {customers.error || reminders.error ? <p role="alert">Le CRM est temporairement indisponible.</p> : <>
      {dueNotifications > 0 && <p className={styles.notice} role="status">{dueNotifications} notification(s) TESAMI à consulter.</p>}
      <FollowupTable title="En retard" rows={rows.filter(item => item.date < today)} today={today} />
      <FollowupTable title="Aujourd’hui" rows={rows.filter(item => item.date === today)} today={today} />
      <FollowupTable title="À venir" rows={rows.filter(item => item.date > today)} today={today} />
      {seller.error ? <p role="alert">Les coordonnées professionnelles sont temporairement indisponibles.</p> : <SellerForm seller={seller.data} />}
      <section>
        <h2>Fichier clients</h2>
        {clients.length === 0 ? <p>Aucune fiche client.</p> : <div className={styles.cards}>
          {clients.map(customer => <Link href={"?client=" + customer.id} className={styles.card} key={customer.id}>{customer.name}</Link>)}
        </div>}
      </section>
      {selected && <section id="fiche" key={selected.id}>
        <h2>Coordonnées du client</h2>
        <CustomerForm customer={selected} today={today} />
        <OrderHistory orders={orders} clientId={selected.id} />
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
