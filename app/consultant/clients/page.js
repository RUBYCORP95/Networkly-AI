import Link from "next/link";
import { Bell, Mail, Package, Settings, Users } from "lucide-react";
import { createServerSupabase } from "../../../lib/supabase/server";
import { formatDate, nextBirthday, parisDate } from "../../../lib/crm/dates.mjs";
import { addFollowup, editOrder, saveClient, saveSeller, updateFollowup, updateOrder } from "./actions";
import { orderFields, orderStatuses, paymentStatuses, receiptNumber, receiptEmailText, sellerFields } from "../../../lib/crm/order-receipt.mjs";
import CustomerList from "./CustomerList";
import OrderReceipt from "./OrderReceipt";
import ShareOrder from "./ShareOrder";
import ShareRegistration from "./ShareRegistration";
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
        <Link className={styles.crmAction} href={"?client=" + item.client_id}>{item.name}</Link>
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

function orderEmailDraft(order, recipient) {
  const address = encodeURIComponent(recipient).replace(/%40/g, "@");
  const subject = encodeURIComponent("Votre bon de commande " + receiptNumber(order.id));
  const body = encodeURIComponent(receiptEmailText(order).replace(/\n/g, "\r\n"));
  return `mailto:${address}?subject=${subject}&body=${body}`;
}

function OrderControls({ order, clientId, clientEmail, returnFilter }) {
  return <>
    <OrderReceipt order={order} />
    <p><Link className={styles.crmAction} href={"?" + new URLSearchParams({ client: clientId, view: "history", edit: order.id })}>Modifier le bon</Link></p>
    <p><a className={styles.crmAction} href={`/api/consultant/orders/${order.id}/pdf`}>Télécharger le PDF</a></p>
    {clientEmail ? <p><a className={`${styles.crmAction} ${styles.orderEmailAction}`} href={orderEmailDraft(order, clientEmail)}><Mail size={17} aria-hidden="true" /> Envoyer le bon par e-mail</a></p>
      : <p>Ajoute l’adresse e-mail du client pour préparer l’envoi.</p>}
    <form action={updateOrder} className={styles.form}>
      <input name="id" type="hidden" value={order.id} />
      {returnFilter && <input name="order_filter" type="hidden" value={returnFilter} />}
      <label>Statut<select name="status" defaultValue={order.status}>
        {orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Paiement<select name="payment_status" defaultValue={order.payment_status}>
        {paymentStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" defaultValue={(order.shipping_cents / 100).toFixed(2)} /></label>
      <button>Mettre à jour</button>
    </form>
  </>;
}

const ordersUrl = (filter = "all", page = 1) => "?view=orders&filter=" + filter + (page > 1 ? "&page=" + page : "");

function filterOrders(query, filter) {
  if (filter === "processed") return query.in("status", ["confirmed", "completed"]).eq("payment_status", "paid");
  if (filter === "pending") return query.neq("status", "cancelled").or("status.eq.pending,payment_status.neq.paid");
  return query;
}

async function AllOrders({ db, params }) {
  const filter = ["pending", "processed"].includes(params.filter) ? params.filter : "all";
  const parsedPage = Number(params.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 1000000 ? parsedPage : 1;
  const size = 20;
  const query = db.from("crm_orders").select(orderFields + ",client_id,crm_clients(name,email)", { count: "exact" })
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * size, page * size - 1);
  const [orders, pending, processed] = await Promise.all([
    filterOrders(query, filter),
    filterOrders(db.from("crm_orders").select("id", { count: "exact", head: true }), "pending"),
    filterOrders(db.from("crm_orders").select("id", { count: "exact", head: true }), "processed"),
  ]);
  return <main className={`${styles.page} ${styles.crmPage}`}>
    <Link className={styles.crmAction} href="/consultant/clients">← Tous les clients</Link>
    <h1>Mes commandes</h1>
    <nav aria-label="Filtrer les commandes" className={styles.orderNavigation}>
      {[["all", "Toutes les commandes", filter === "all" ? orders.count : null],
        ["pending", "Commandes en attente", pending.count],
        ["processed", "Commandes traitées", processed.count]].map(([value, label, count]) =>
        <Link key={value} className={styles.crmAction} href={ordersUrl(value)} aria-current={filter === value ? "page" : undefined}>
          {label}{count !== null && " (" + count + ")"}
        </Link>)}
    </nav>
    <p>Une commande passe dans « Commandes traitées » quand elle est payée et que son statut est « Confirmée » ou « Terminée ».</p>
    {notices.has(params.result) && <p className={styles.notice} role="status">{notices.get(params.result)}</p>}
    {orders.error ? <p role="alert">Les commandes sont temporairement indisponibles.</p> : <>
      {!orders.data.length && <p>Aucune commande dans cette vue.</p>}
      <ul className={styles.trips}>
        {orders.data.map(order => <li key={order.id} className={styles.panel}>
          <h2><Link className={styles.crmAction} href={"?client=" + order.client_id}>{order.crm_clients?.name ?? "Fiche client"}</Link></h2>
          <OrderControls order={order} clientId={order.client_id} clientEmail={order.crm_clients?.email?.trim()} returnFilter={filter} />
        </li>)}
      </ul>
      {(page > 1 || page * size < orders.count) && <nav aria-label="Pages des commandes" className={styles.orderNavigation}>
        {page > 1 && <Link className={styles.crmAction} href={ordersUrl(filter, page - 1)}>← Page précédente</Link>}
        {page * size < orders.count && <Link className={styles.crmAction} href={ordersUrl(filter, page + 1)}>Page suivante →</Link>}
      </nav>}
    </>}
  </main>;
}

function OrderHistory({ orders, clientId, clientEmail, editId }) {
  const orderToEdit = editId && orders.data?.find(order => order.id === editId);
  if (orderToEdit) return <section>
    <h2>Modifier le bon de commande {receiptNumber(orderToEdit.id)}</h2>
    <p><Link className={styles.crmAction} href={"?" + new URLSearchParams({ client: clientId, view: "history" })}>Annuler</Link></p>
    <OrderForm key={orderToEdit.id} order={orderToEdit} submitAction={editOrder.bind(null, orderToEdit.id, clientId)} />
  </section>;
  return <section>
    <h2>Historique des commandes</h2>
    <p>L’envoi ouvre un brouillon dans ta messagerie. Choisis ton adresse professionnelle, puis clique sur Envoyer.</p>
    {orders.error ? <p role="alert">L’historique est temporairement indisponible.</p> : <>
      {orders.data.length === 0 ? <p>Aucune commande pour ce client.</p> : <ul className={styles.trips}>
        {orders.data.map(order => <li key={order.id} className={styles.panel}>
          <OrderControls order={order} clientId={clientId} clientEmail={clientEmail} />
        </li>)}
      </ul>}
    </>}
  </section>;
}

export const metadata = { title: "Mes clients et rappels · TESAMI" };

export default async function ClientsPage({ searchParams }) {
  const params = await searchParams;
  const today = parisDate();
  const db = await createServerSupabase();
  if (params.view === "orders") return <AllOrders db={db} params={params} />;
  const [customers, seller, reminders, activeFollowups, orderCount] = await Promise.all([
    db.from("crm_clients").select("id,name,email,phone,birth_date,birthday_notification", { count: "exact" }).order("name").order("id"),
    db.from("crm_seller_profiles").select("name,business,email,phone,address,registration").maybeSingle(),
    db.from("crm_followups").select("id,client_id,due_date,notification,completed_at").order("due_date"),
    db.from("crm_followups").select("id", { count: "exact", head: true }).is("completed_at", null),
    db.from("crm_orders").select("id", { count: "exact", head: true }),
  ]);
  const clients = customers.data ?? [];
  const names = new Map(clients.map(customer => [customer.id, customer.name]));
  const selected = clients.find(customer => customer.id === params.client);
  const history = selected && params.view === "history";
  const orders = history ? await db.from("crm_orders")
    .select(orderFields).eq("client_id", selected.id)
    .order("created_at", { ascending: false }).order("id", { ascending: false }) : null;
  const active = (reminders.data ?? []).filter(item => !item.completed_at && names.has(item.client_id))
    .map(item => ({...item, name: names.get(item.client_id), date: item.due_date}));
  const birthdays = clients.filter(customer => customer.birth_date)
    .map(customer => ({ id: "birthday-" + customer.id, client_id: customer.id, name: customer.name,
      date: nextBirthday(customer.birth_date, today), birthday: true, notification: customer.birthday_notification }));
  const rows = [...active, ...birthdays].sort((a, b) => a.date.localeCompare(b.date));
  const dueNotifications = rows.filter(item => item.notification && item.date <= today).length;

  const settings = params.view === "settings";
  const stats = [[Users, "Clients", customers.count], [Bell, "Relances ouvertes", activeFollowups.count], [Package, "Commandes", orderCount.count]];

  return <main className={`${styles.page} ${styles.crmPage}`}>
    <Link className={styles.crmAction} href="/consultant">← Espace Consultant</Link>
    <header className={styles.crmHeader}>
      <h1>{settings ? "Paramètres du CRM" : selected?.name ?? "Mes clients"}</h1>
      {settings || selected ? <Link className={styles.crmAction} href="/consultant/clients">← Tous les clients</Link> :
        <Link className={styles.crmAction} href="?view=settings"><Settings size={17} aria-hidden="true" /> Paramètres</Link>}
    </header>
    {notices.has(params.result) && <p className={styles.notice} role="status">{notices.get(params.result)}</p>}
    {settings ? (seller.error ? <p role="alert">Les coordonnées professionnelles sont temporairement indisponibles.</p> :
      <div className={styles.panel}><SellerForm seller={seller.data} /></div>) :
    customers.error || (!history && reminders.error) ? <p role="alert">Le CRM est temporairement indisponible.</p> : <>
      {dueNotifications > 0 && <p className={styles.notice} role="status">{dueNotifications} notification(s) TESAMI à consulter.</p>}
      {!selected && <>
        <dl className={styles.crmStats}>
          {stats.map(([Icon, label, count]) => <div className={styles.crmStat} key={label}>
            <span className={styles.crmAvatar} aria-hidden="true"><Icon size={19} /></span>
            <dt>{label === "Commandes" ? <Link className={styles.orderCardLink} href={ordersUrl()}>Commandes</Link> : label}</dt><dd>{count ?? "—"}</dd>
          </div>)}
        </dl>
        <CustomerList customers={clients.map(({ id, name, email }) => ({ id, name, email }))} />
      </>}
      {!selected && <div className={styles.crmReminders}>
      <FollowupTable title="En retard" rows={rows.filter(item => item.date < today)} today={today} />
      <FollowupTable title="Aujourd’hui" rows={rows.filter(item => item.date === today)} today={today} />
      <FollowupTable title="À venir" rows={rows.filter(item => item.date > today)} today={today} />
      </div>}
      {selected && <p><Link className={styles.crmAction} href="?view=settings">Paramètres professionnels</Link></p>}
      {selected && <section id="fiche" key={selected.id}>
        <nav className={styles.orderNavigation} aria-label="Sections de la fiche client">
          <Link className={styles.crmAction} href={"?client=" + selected.id} aria-current={!history ? "page" : undefined}>Fiche client</Link>
          <Link className={styles.crmAction} href={"?client=" + selected.id + "&view=history"} aria-current={history ? "page" : undefined}>Historique des commandes</Link>
        </nav>
        {history ? <OrderHistory orders={orders} clientId={selected.id} clientEmail={selected.email?.trim()} editId={params.edit} /> : <>
          <section>
            <h2>Partager un bon de commande</h2>
            <ShareOrder clientId={selected.id} />
            <h2>Ajouter une commande</h2>
            <OrderForm clientId={selected.id} />
          </section>
          <h2>Coordonnées du client</h2>
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
        </>}
      </section>}
      {!selected && <section className={styles.panel}>
        <h2>Ajouter un client</h2>
        <ShareRegistration />
        <CustomerForm today={today} />
      </section>}
    </>}
  </main>;
}
