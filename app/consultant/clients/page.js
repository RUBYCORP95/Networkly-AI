import Link from "next/link";
import { Bell, Mail, Package, Settings, Users } from "lucide-react";
import { createServerSupabase } from "../../../lib/supabase/server";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { requireConsultant } from "../../../lib/auth/consultant";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { formatDate, isDate, nextBirthday, parisDate } from "../../../lib/crm/dates.mjs";
import { addFollowup, editOrder, saveClient, saveSeller, updateFollowup, updateOrder } from "./actions";
import { orderFields, orderStatuses, paymentStatuses, receiptNumber, receiptEmailText, sellerFields } from "../../../lib/crm/order-receipt.mjs";
import CustomerList from "./CustomerList";
import DeleteClient from "./DeleteClient";
import OrderReceipt from "./OrderReceipt";
import ShareOrder from "./ShareOrder";
import ShareRegistration from "./ShareRegistration";
import { publicPaymentLinks } from "../../../lib/crm/payment-links.mjs";
import CustomerAccountLink from "./CustomerAccountLink";
import PaymentLinksForm from "./PaymentLinksForm";
import OrderForm from "./OrderForm";
import InvoiceUpload from "./InvoiceUpload";
import styles from "../consultant.module.css";

const notices = new Map([
  ["invalid", "Vérifie les informations saisies."],
  ["error", "L’opération a échoué. Réessaie dans un instant."],
  ["client", "Fiche client enregistrée."],
  ["deleted", "Client retiré du fichier actif. Ses commandes et factures sont conservées."],
  ["delete_error", "Impossible de supprimer cette fiche client. Vérifie qu’elle est toujours disponible."],
  ["followup", "Relance programmée."],
  ["catalogue", "Un produit ou un prix du catalogue est indisponible. Relance la recherche."],
  ["invalid_payment", "Renseigne un nom et un lien HTTPS valide pour chaque moyen de paiement."],
  ["payment_saved", "Moyens de paiement enregistrés."],
  ["seller_required", "Enregistre d’abord tes coordonnées professionnelles."],
  ["prefix_taken", "Ce préfixe est déjà réservé par un autre consultant."],
  ["prefix_invalid", "Saisis 2 à 12 lettres ou chiffres en commençant par une lettre. Les préfixes BC suivis uniquement de chiffres sont réservés."],
  ["seller", "Coordonnées professionnelles enregistrées."],
  ["order", "Commande enregistrée."],
  ["invoice", "Facture importée."],
  ["invoice_duplicate", "Cette facture est déjà archivée."],
  ["invoice_metadata", "Vérifie les informations inscrites sur le PDF."],
  ["invoice_amount", "Saisis le montant exact indiqué sur le PDF et confirme-le avant l’import."],
  ["invoice_invalid", "Vérifie la date de facture et choisis un PDF valide de 3 Mo maximum."],
  ["updated", "Relance mise à jour."],
]);

const clientFields = "id,name,email,phone,birth_date,birthday_notification,lead_source,lead_location,lead_note,archived_at";

function CustomerForm({ customer, today }) {
  return <form action={saveClient} className={styles.form}>
    {customer && <input type="hidden" name="id" value={customer.id} />}
    <label>Nom<input name="name" maxLength={120} defaultValue={customer?.name} required /></label>
    <label>E-mail<input name="email" type="email" maxLength={254} defaultValue={customer?.email ?? ""} /></label>
    <label>Téléphone<input name="phone" type="tel" maxLength={40} defaultValue={customer?.phone ?? ""} /></label>
    <label>Date de naissance<input name="birth_date" type="date" max={today} defaultValue={customer?.birth_date ?? ""} /></label>
    <label>Notification annuelle d’anniversaire<input type="checkbox" name="birthday_notification" defaultChecked={customer?.birthday_notification ?? false} /></label>
    {customer?.lead_source && <label>Annotation LeadFactory
      <textarea name="lead_note" maxLength={500} defaultValue={customer.lead_note ?? ""} />
    </label>}
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
      <label>Préfixe des nouveaux bons de commande
        <input name="order_prefix" maxLength={12} autoComplete="off" placeholder={seller?.order_namespace ? "BC" + seller.order_namespace : "Ex. RUBY"}
          defaultValue={seller?.order_prefix ?? ""} />
        <small>Ex. RUBY-000123. Vide, TESAMI attribue ton préfixe automatiquement.</small>
      </label>
      <button>Enregistrer mes coordonnées</button>
    </form>
  </section>;
}

function orderEmailDraft(order, recipient, paymentLinks) {
  const address = encodeURIComponent(recipient).replace(/%40/g, "@");
  const subject = encodeURIComponent("Votre bon de commande " + receiptNumber(order));
  const body = encodeURIComponent(receiptEmailText(order, paymentLinks).replace(/\n/g, "\r\n"));
  return `mailto:${address}?subject=${subject}&body=${body}`;
}

function OrderControls({ order, clientId, clientEmail, returnFilter, dates, paymentLinks }) {
  return <>
    <OrderReceipt order={order} />
    {order.catalogue_request_id && order.delivery_address && <p>Adresse de livraison · {order.delivery_address}</p>}
    <div className={styles.orderActions}>
      <Link className={styles.crmAction} href={"?" + new URLSearchParams({ client: clientId, view: "history", edit: order.id })}>Modifier le bon</Link>
      <Link className={styles.crmAction} href={order.host_session_id ? "/consultant/hotes" : "/consultant/hotes?order=" + order.id}>
        {order.host_session_id ? "Commande rattachée à un hôte" : "Rattacher à un hôte"}
      </Link>
      <form action={`/api/consultant/orders/${order.id}/pdf`} method="post">
        <button className={styles.crmAction}>Télécharger le PDF</button>
      </form>
      {clientEmail && <a className={`${styles.crmAction} ${styles.orderEmailAction}`} href={orderEmailDraft(order, clientEmail, paymentLinks)}><Mail size={17} aria-hidden="true" /> Envoyer le bon par e-mail</a>}
    </div>
    {!clientEmail && <p>Ajoute l’adresse e-mail du client pour préparer l’envoi.</p>}
    <form action={updateOrder} className={styles.form}>
      <input name="id" type="hidden" value={order.id} />
      {returnFilter && <>
        <input name="order_filter" type="hidden" value={returnFilter} />
        {Object.entries(dates).map(([key, value]) => <input key={key} name={key} type="hidden" value={value} />)}
      </>}
      <label>Statut<select name="status" defaultValue={order.status}>
        {orderStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Paiement<select name="payment_status" defaultValue={order.payment_status}>
        {paymentStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Livraison (€)<input name="shipping" type="number" min={0} max={999999.99} step="0.01" defaultValue={(order.shipping_cents / 100).toFixed(2)} /></label>
      {order.catalogue_request_id && <>
        <label>Cadeau offert<input name="gift_product" maxLength={220} defaultValue={order.gift_product ?? ""} /></label>
        <label>Quantité du cadeau<input name="gift_quantity" type="number" min={1} max={999}
          defaultValue={order.gift_quantity ?? 1} /></label>
      </>}
      <button>Mettre à jour</button>
    </form>
  </>;
}

function ordersUrl(filter = "all", page = 1, dates = {}) {
  const query = new URLSearchParams({ view: "orders", filter, ...dates });
  if (page > 1) query.set("page", page);
  return "?" + query;
}

function filterOrderDates(query, { from, to }) {
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);
  return query;
}

function filterOrders(query, filter) {
  if (filter === "processed") return query.in("status", ["confirmed", "completed"]).eq("payment_status", "paid");
  if (filter === "pending") return query.neq("status", "cancelled").or("status.eq.pending,payment_status.neq.paid");
  return query;
}

async function AllOrders({ db, params }) {
  const paymentProfile = await db.from("crm_seller_profiles").select("payment_links").maybeSingle();
  const filter = ["pending", "processed"].includes(params.filter) ? params.filter : "all";
  const dates = {};
  for (const key of ["from", "to"]) if (isDate(params[key])) dates[key] = params[key];
  const parsedPage = Number(params.page);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 1000000 ? parsedPage : 1;
  const size = 20;
  const query = db.from("crm_orders").select(orderFields + ",host_session_id,catalogue_request_id,delivery_address,client_id,crm_clients(name,email)", { count: "exact" })
    .order("order_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * size, page * size - 1);
  const [orders, pending, processed] = await Promise.all([
    filterOrders(filterOrderDates(query, dates), filter),
    ...["pending", "processed"].map(status => filterOrders(filterOrderDates(
      db.from("crm_orders").select("id", { count: "exact", head: true }), dates), status)),

  ]);
  return <main className={`${styles.page} ${styles.crmPage}`}>
    <Link className={styles.crmAction} href="/consultant/clients">← Tous les clients</Link>
    <h1>Mes commandes</h1>
    <form method="get" className={styles.form}>
      <input type="hidden" name="view" value="orders" />
      <input type="hidden" name="filter" value={filter} />
      <label>Commandes à partir du<input type="date" name="from" defaultValue={dates.from} /></label>
      <label>Commandes jusqu’au<input type="date" name="to" defaultValue={dates.to} /></label>
      <button>Filtrer par date</button>
      {(dates.from || dates.to) && <Link className={styles.crmAction} href={ordersUrl(filter)}>Effacer les dates</Link>}
    </form>
    <nav aria-label="Filtrer les commandes" className={styles.orderNavigation}>
      {[["all", "Toutes les commandes", filter === "all" ? orders.count : null],
        ["pending", "Commandes en attente", pending.count],
        ["processed", "Commandes traitées", processed.count]].map(([value, label, count]) =>
        <Link key={value} className={styles.crmAction} href={ordersUrl(value, 1, dates)} aria-current={filter === value ? "page" : undefined}>
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
          <OrderControls order={order} clientId={order.client_id} clientEmail={order.crm_clients?.email?.trim()} returnFilter={filter} dates={dates} paymentLinks={paymentProfile.data?.payment_links} />
        </li>)}
      </ul>
      {(page > 1 || page * size < orders.count) && <nav aria-label="Pages des commandes" className={styles.orderNavigation}>
        {page > 1 && <Link className={styles.crmAction} href={ordersUrl(filter, page - 1, dates)}>← Page précédente</Link>}
        {page * size < orders.count && <Link className={styles.crmAction} href={ordersUrl(filter, page + 1, dates)}>Page suivante →</Link>}
      </nav>}
    </>}
  </main>;
}

function OrderHistory({ orders, clientId, clientEmail, editId, today, paymentLinks }) {
  const orderToEdit = editId && orders.data?.find(order => order.id === editId);
  if (orderToEdit) return <section>
    <h2>Modifier le bon de commande {receiptNumber(orderToEdit)}</h2>
    <p><Link className={styles.crmAction} href={"?" + new URLSearchParams({ client: clientId, view: "history" })}>Annuler</Link></p>
    <OrderForm key={orderToEdit.id} order={orderToEdit} today={today} submitAction={editOrder.bind(null, orderToEdit.id, clientId)} />
  </section>;
  return <section>
    <h2>Historique des commandes</h2>
    <p>L’envoi ouvre un brouillon dans ta messagerie. Choisis ton adresse professionnelle, puis clique sur Envoyer.</p>
    {orders.error ? <p role="alert">L’historique est temporairement indisponible.</p> : <>
      {orders.data.length === 0 ? <p>Aucune commande pour ce client.</p> : <ul className={styles.trips}>
        {orders.data.map(order => <li key={order.id} className={styles.panel}>
          <OrderControls order={order} clientId={clientId} clientEmail={clientEmail} paymentLinks={paymentLinks} />
        </li>)}
      </ul>}
    </>}
  </section>;
}

async function ClientInvoices({ db, clientId, today, params }) {
  const invoiceDate = isDate(params.invoice_date) ? params.invoice_date : "";
  let query = db.from("crm_client_invoices").select("id,filename,document_date,order_id,finance_declared_cents")
    .eq("client_id", clientId).order("document_date", { ascending: false })
    .order("uploaded_at", { ascending: false }).order("id", { ascending: false });
  if (invoiceDate) query = query.eq("document_date", invoiceDate);
  const { data, error } = await query;
  return <section>
    <h2>Factures du client</h2>
    <p><Link className={styles.crmAction} href="/consultant/factures">Toutes mes factures</Link></p>
    <InvoiceUpload clientId={clientId} today={today} />
    <form method="get" className={styles.form}>
      <input name="client" type="hidden" value={clientId} />
      <input name="view" type="hidden" value="invoices" />
      <label>Filtrer par date<input name="invoice_date" type="date" max={today} defaultValue={invoiceDate} required /></label>
      <button>Afficher les documents</button>
      {invoiceDate && <Link className={styles.crmAction} href={"?client=" + clientId + "&view=invoices"}>Toutes les dates</Link>}
    </form>
    {error ? <p role="alert">Les factures sont temporairement indisponibles.</p> :
      data.length === 0 ? <p>{invoiceDate ? "Aucun document à cette date." : "Aucun document archivé."}</p> :
      <ul className={styles.trips}>
        {data.map(invoice => <li className={styles.panel} key={invoice.id}>
          <p>{invoice.order_id ? "Bon de commande" : "Facture importée"} · <time dateTime={invoice.document_date}>{formatDate(invoice.document_date)}</time></p>
          {invoice.finance_declared_cents !== null && <p>Montant confirmé à l’import · {formatEuros(invoice.finance_declared_cents)}</p>}
          <a className={styles.crmAction} style={{ overflowWrap: "anywhere" }}
            href={`/api/consultant/invoices/${invoice.id}`} download>{invoice.filename}</a>
        </li>)}
      </ul>}
  </section>;
}

export const metadata = { title: "Mes clients et rappels · TESAMI" };

async function OtherConsultantsClients({ params, owner }) {
  const search = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const page = /^[1-9][0-9]{0,5}$/.test(params.page) ? Number(params.page) : 1;
  const size = 30;
  const from = (page - 1) * size;
  const admin = createAdminSupabase();
  let query = admin.from("crm_clients").select("id,name,email,owner_id", { count: "exact" })
    .neq("owner_id", owner).is("archived_at", null);
  if (search) {
    const name = search.replace(/[\\%_*]/g, "\\$&");
    query = query.ilike("name", "%" + name + "%");
  }
  const { data, error, count } = await query.order("name").order("id").range(from, from + size - 1);
  const ownerIds = [...new Set((data ?? []).map(customer => customer.owner_id))];
  const { data: owners } = ownerIds.length
    ? await admin.from("profiles").select("id,full_name").in("id", ownerIds)
    : { data: [] };
  const ownerNames = new Map((owners ?? []).map(profile => [profile.id, profile.full_name]));
  const pageLink = number => "?" + new URLSearchParams({ view: "manage", q: search, page: number });

  return <main className={`${styles.page} ${styles.crmPage}`}>
    <Link className={styles.crmAction} href="/consultant/clients">← Mes clients</Link>
    <h1>Clients des autres consultants</h1>
    {notices.has(params.result) && <p className={styles.notice} role="status">{notices.get(params.result)}</p>}
    <form method="get" className={styles.form}>
      <input type="hidden" name="view" value="manage" />
      <label>Nom du client<input name="q" type="search" defaultValue={search} maxLength={120} /></label>
      <button>Rechercher</button>
    </form>
    {error ? <p role="alert">Le fichier clients est temporairement indisponible.</p> : <>
      <p role="status">{count} fiche(s) active(s)</p>
      <ul className={styles.crmClientList}>
        {data.map(customer => {
          const owner = ownerNames.get(customer.owner_id)?.trim() || customer.owner_id;
          return <li key={customer.id} className={styles.crmClientRow}>
            <span className={styles.crmManagedClient}>
              <strong>{customer.name}</strong>
              {customer.email && <small>{customer.email}</small>}
              <small>Consultant · {owner}</small>
            </span>
            <DeleteClient customer={customer} adminSearch={search} owner={owner} />
          </li>;
        })}
      </ul>
      <nav className={styles.orderNavigation} aria-label="Pages des clients">
        {page > 1 && <Link className={styles.crmAction} href={pageLink(page - 1)}>Page précédente</Link>}
        {count > from + size && <Link className={styles.crmAction} href={pageLink(page + 1)}>Page suivante</Link>}
      </nav>
    </>}
  </main>;
}

export default async function ClientsPage({ searchParams }) {
  const params = await searchParams;
  const today = parisDate();
  const db = await createServerSupabase();
  if (params.view === "orders") return <AllOrders db={db} params={params} />;
  const access = await requireConsultant(db);
  const isAdmin = access.ok && access.profile.is_admin === true;
  if (params.view === "manage" && isAdmin) return <OtherConsultantsClients params={params} owner={access.user.id} />;
  if (params.view === "archived") {
    const { data, error } = await db.from("crm_clients").select("id,name,email").not("archived_at", "is", null).order("name").order("id");
    return <main className={`${styles.page} ${styles.crmPage}`}>
      <Link className={styles.crmAction} href="/consultant/clients">← Mes clients</Link>
      {error ? <p role="alert">Les clients supprimés sont temporairement indisponibles.</p> :
        <CustomerList customers={data} archived />}
    </main>;
  }
  const [customers, seller, reminders, activeFollowups, orderCount, customerInvite] = await Promise.all([
    db.from("crm_clients").select(clientFields, { count: "exact" }).is("archived_at", null).order("name").order("id"),
    db.from("crm_seller_profiles").select("name,business,email,phone,address,registration,payment_links,order_prefix,order_namespace").maybeSingle(),
    db.from("crm_followups").select("id,client_id,due_date,notification,completed_at").order("due_date"),
    db.from("crm_followups").select("id,crm_clients!inner()", { count: "exact", head: true })
      .is("completed_at", null).is("crm_clients.archived_at", null),
    db.from("crm_orders").select("id", { count: "exact", head: true }),
    db.from("crm_customer_invites").select("token").maybeSingle(),
  ]);
  const clients = customers.data ?? [];
  const names = new Map(clients.map(customer => [customer.id, customer.name]));
  let selected = clients.find(customer => customer.id === params.client);
  if (!selected && typeof params.client === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.client)) {
    const { data } = await db.from("crm_clients").select(clientFields).eq("id", params.client).maybeSingle();
    selected = data;
  }
  const invoices = selected && params.view === "invoices";
  const archived = Boolean(selected?.archived_at);
  const history = selected && !invoices && (archived || params.view === "history");
  const orders = history ? await db.from("crm_orders")
    .select(orderFields + ",host_session_id,catalogue_request_id,delivery_address").eq("client_id", selected.id)
    .order("order_date", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }) : null;
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
      {settings || selected ? <Link className={styles.crmAction} href={archived ? "?view=archived" : "/consultant/clients"}>{archived ? "← Clients supprimés" : "← Tous les clients"}</Link> :
        <Link className={styles.crmAction} href="?view=settings"><Settings size={17} aria-hidden="true" /> Paramètres</Link>}
    </header>
    {notices.has(params.result) && <p className={styles.notice} role="status">{notices.get(params.result)}</p>}
    {settings ? (seller.error ? <p role="alert">Les coordonnées professionnelles sont temporairement indisponibles.</p> :
      <><div className={styles.panel}><SellerForm seller={seller.data} /></div>
       <section className={styles.panel} id="moyens-de-paiement">
         <h2>Moyens de paiement</h2>
         <p>Ces liens sont proposés dans les e-mails des commandes à payer.</p>
         {seller.data ? <PaymentLinksForm links={publicPaymentLinks(seller.data.payment_links)} /> :
           <p>Enregistre tes coordonnées professionnelles pour ajouter des liens.</p>}
       </section></>) :
    customers.error || (!history && !invoices && reminders.error) ? <p role="alert">Le CRM est temporairement indisponible.</p> : <>
      {dueNotifications > 0 && <p className={styles.notice} role="status">{dueNotifications} notification(s) TESAMI à consulter.</p>}
      {!selected && <>
        {customerInvite.data?.token && <section className={styles.panel}>
          <h2>Inviter des clients</h2><p>Partage le formulaire de fiche client ou le lien de commande directe. Les commandes suivantes se rattachent à la fiche dans ton CRM.</p>
          <CustomerAccountLink token={customerInvite.data.token} />
        </section>}
        <dl className={styles.crmStats}>
          {stats.map(([Icon, label, count]) => <div className={styles.crmStat} key={label}>
            <span className={styles.crmAvatar} aria-hidden="true"><Icon size={19} /></span>
            <dt>{label === "Commandes" ? <Link className={styles.orderCardLink} href={ordersUrl()}>Commandes</Link> : label}</dt><dd>{count ?? "—"}</dd>
          </div>)}
        </dl>
        <nav className={styles.orderNavigation} aria-label="Gestion des fiches clients">
          <Link className={styles.crmAction} href="?view=archived">Clients supprimés</Link>
          {isAdmin && <Link className={styles.crmAction} href="?view=manage">Clients des autres consultants</Link>}
        </nav>
        <CustomerList customers={clients.map(({ id, name, email }) => ({ id, name, email }))} />
      </>}
      {!selected && <div className={styles.crmReminders}>
      <FollowupTable title="En retard" rows={rows.filter(item => item.date < today)} today={today} />
      <FollowupTable title="Aujourd’hui" rows={rows.filter(item => item.date === today)} today={today} />
      <FollowupTable title="À venir" rows={rows.filter(item => item.date > today)} today={today} />
      </div>}
      {selected && !archived && <div className={styles.orderNavigation}>
        <Link className={styles.crmAction} href="?view=settings">Paramètres professionnels</Link>
        <DeleteClient customer={{ id: selected.id, name: selected.name }} detail />
      </div>}
      {selected && <section id="fiche" key={selected.id}>
        {archived && <p className={styles.notice}>Ce client a été retiré du fichier actif.</p>}
        {!archived && selected.lead_source && <p>
          <strong>{selected.lead_note || "Client issu de LeadFactory"}</strong>
          {" · "}{selected.lead_source === "klaviyo" ? "Klaviyo" : "Prospect professionnel"}
          {selected.lead_location && " · " + selected.lead_location}
        </p>}
        <nav className={styles.orderNavigation} aria-label="Sections de la fiche client">
          {!archived && <Link className={styles.crmAction} href={"?client=" + selected.id} aria-current={!history && !invoices ? "page" : undefined}>Fiche client</Link>}
          <Link className={styles.crmAction} href={"?client=" + selected.id + "&view=history"} aria-current={history ? "page" : undefined}>Historique des commandes</Link>
          <Link className={styles.crmAction} href={"?client=" + selected.id + "&view=invoices"} aria-current={invoices ? "page" : undefined}>Factures</Link>
        </nav>
        {history ? <OrderHistory orders={orders} clientId={selected.id} clientEmail={selected.email?.trim()} editId={params.edit} today={today} paymentLinks={seller.data?.payment_links} /> :
          invoices ? <ClientInvoices db={db} clientId={selected.id} today={today} params={params} /> : <>
          <section>
            <h2>Partager un bon de commande</h2>
            <ShareOrder clientId={selected.id} />
            <h2>Ajouter une commande</h2>
            <OrderForm clientId={selected.id} today={today} />
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
