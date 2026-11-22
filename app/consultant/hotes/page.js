import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import { formatDate, parisDate } from "../../../lib/crm/dates.mjs";
import { hostCaseStatuses, hostKinds, hostLinkActive, hostStatuses, hostUuid, meetingDeliveryModes } from "../../../lib/crm/hosts.mjs";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { orderStatuses, paymentStatuses, receiptNumber } from "../../../lib/crm/order-receipt.mjs";
import styles from "../consultant.module.css";
import { attachOrder, manageGift, saveHost } from "./actions";
import HostLinks from "./HostLinks";
import HostSummary from "./HostSummary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hôte / Hôtesse · TESAMI" };

const root = "/consultant/hotes";
const notices = {
  saved: "Enregistré.",
  invalid: "Vérifie les champs renseignés et les dates.",
  "delivery-locked": "Le mode de livraison est déjà associé aux bons de cette réunion.",
  error: "L’enregistrement a échoué. Réessaie dans un instant.",
  "duplicate-gift": "Un cadeau est déjà configuré pour ce palier.",
  threshold: "Le chiffre d’affaires validé ne suffit pas encore pour remettre ce cadeau.",
  "unavailable-order": "Ce bon est introuvable ou déjà rattaché à une session.",
};

function sessionUrl(kind, id, order) {
  const params = new URLSearchParams({ type: kind });
  if (id) params.set("session", id);
  if (order) params.set("order", order);
  return root + "?" + params;
}

function SessionForm({ kind, session, today, clients }) {
  const isCase = kind === "case";
  return <form action={saveHost} className={styles.form}>
    <input type="hidden" name="kind" value={kind} />
    {session && <input type="hidden" name="session_id" value={session.id} />}
    <label>Nom de l’hôte ou de l’hôtesse<input name="host_name" maxLength={120} defaultValue={session?.host_name} required /></label>
    <label>Fiche client de l’hôte (facultative)<select name="host_client_id" defaultValue={session?.host_client_id ?? ""}>
      <option value="">Aucune fiche liée</option>
      {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
    </select></label>
    <label>{isCase ? "Date de remise" : "Date de la réunion"}<input name="starts_on" type="date" defaultValue={session?.starts_on ?? today} required /></label>
    {isCase ? <label>Date de retour<input name="ends_on" type="date" defaultValue={session?.ends_on} required /></label> : <>
      <label>Lieu<input name="venue" maxLength={240} defaultValue={session?.venue} required /></label>
      <label>Mode de livraison<select name="delivery_mode" defaultValue={session?.delivery_mode ?? ""} required>
        <option value="" disabled>Choisir le mode de livraison</option>
        {Object.entries(meetingDeliveryModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Adresse de livraison chez l’hôte (si différente du lieu)
        <textarea name="delivery_address" maxLength={500} defaultValue={session?.delivery_address ?? ""} rows={2} />
      </label>
      <label>Invités (un par ligne)<textarea name="guests" maxLength={4000} defaultValue={session?.guests} rows={3} /></label>
    </>}
    <label>Statut<select name="status" defaultValue={session?.status ?? "planned"}>
      {Object.entries(isCase ? hostCaseStatuses : hostStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label>Livraison par commande (€)<input name="shipping" inputMode="decimal"
      defaultValue={session ? (session.shipping_cents / 100).toFixed(2) : "0,00"} /></label>
    <button>{session ? "Enregistrer la session" : "Créer la session"}</button>
  </form>;
}

function ExistingOrders({ session, orders }) {
  return <section className={styles.panel}>
    <h2>Rattacher un bon existant</h2>
    <p>Pour un bon plus ancien, ouvre-le dans le CRM et choisis « Rattacher à un hôte ».</p>
    {orders?.length ? <form action={attachOrder} className={styles.form}>
      <input type="hidden" name="session_id" value={session.id} />
      <label>Bon de commande<select name="order_id" required>
        {orders.map(order => <option key={order.id} value={order.id}>{receiptNumber(order.id)} · {formatDate(order.order_date)}
          {order.total_cents != null ? " · " + formatEuros(order.total_cents + order.shipping_cents) : ""}</option>)}
      </select></label>
      <button>Rattacher le bon</button>
    </form> : <p>Aucun bon disponible à rattacher.</p>}
  </section>;
}

export default async function HostsPage({ searchParams }) {
  const query = await searchParams;
  const kind = query.type === "case" ? "case" : "meeting";
  const order = typeof query.order === "string" && hostUuid.test(query.order) ? query.order : null;
  const id = typeof query.session === "string" && hostUuid.test(query.session) ? query.session : null;
  const db = await createServerSupabase();
  const today = parisDate();
  const [sessions, seller, clients] = await Promise.all([
    db.from("crm_host_sessions").select("id,kind,host_name,starts_on,status").eq("kind", kind).order("starts_on", { ascending: false }).order("id"),
    db.from("crm_seller_profiles").select("name").maybeSingle(),
    db.from("crm_clients").select("id,name").order("name").order("id"),
  ]);
  const { data: session } = id ? await db.from("crm_host_sessions")
    .select("id,kind,host_name,host_client_id,starts_on,ends_on,venue,guests,status,shipping_cents,delivery_mode,delivery_address,order_token,tracking_token").eq("id", id).eq("kind", kind).maybeSingle() : {};
  const [sales, gifts, orders, linkedOrders, affiliates] = session ? await Promise.all([
    db.from("crm_host_sales").select("paid_orders,paid_cents").eq("session_id", id).maybeSingle(),
    db.from("crm_host_gifts").select("id,label,threshold_cents,delivered_at").eq("session_id", id).order("threshold_cents"),
    (order ? db.from("crm_orders").select("id,order_date,total_cents,shipping_cents").eq("id", order).is("host_session_id", null)
      : db.from("crm_orders").select("id,order_date,total_cents,shipping_cents").is("host_session_id", null).order("order_date", { ascending: false }).limit(30)),
    db.from("crm_orders").select("id,client_id,order_date,total_cents,shipping_cents,status,payment_status,delivery_address")
      .eq("host_session_id", id).order("order_date", { ascending: false }).order("id").limit(30),
    db.from("crm_host_clients").select("client_id,crm_clients(name)", { count: "exact" }).eq("session_id", id).order("client_id").limit(30),
  ]) : [];

  return <main className={styles.page}>
    <Link href="/consultant">← Espace Consultant</Link>
    <h1>Hôte / Hôtesse</h1>
    <nav className={styles.orderNavigation} aria-label="Type de session">
      {Object.entries(hostKinds).map(([key, title]) => <Link key={key} className={styles.crmAction}
        aria-current={kind === key ? "page" : undefined} href={sessionUrl(key, null, order)}>{title}</Link>)}
    </nav>
    {kind === "case" && <p><Link href="/consultant/mallettes">Ouvrir le planning des mallettes</Link></p>}
    {typeof query.result === "string" && Object.hasOwn(notices, query.result) &&
      <p className={styles.notice} role="status">{notices[query.result]}</p>}
    {!seller.data && <p><Link href="/consultant/clients?view=settings">Configure tes coordonnées professionnelles</Link> pour ouvrir les commandes.</p>}
    {order && !session && <p>Sélectionne la session à laquelle rattacher le bon {receiptNumber(order)}.</p>}
    <section>
      <h2>{hostKinds[kind]}</h2>
      {sessions.error ? <p role="alert">Les sessions sont temporairement indisponibles.</p> :
        <ul className={styles.trips}>{sessions.data.map(item => <li key={item.id}>
          <Link className={styles.crmAction} aria-current={item.id === id ? "page" : undefined} href={sessionUrl(kind, item.id, order)}>
            {item.host_name} · {formatDate(item.starts_on)} · {(kind === "case" ? hostCaseStatuses : hostStatuses)[item.status]}
          </Link>
        </li>)}</ul>}
      <details open={!session && !order} className={styles.panel}>
        <summary>Créer une session</summary>
        <SessionForm kind={kind} today={today} clients={clients.data ?? []} />
      </details>
    </section>
    {id && !session && <p role="alert">Cette session est introuvable.</p>}
    {session && <>
      <section className={styles.panel}>
        <h2>{session.host_name}</h2>
        <SessionForm key={session.id} kind={kind} session={session} today={today} clients={clients.data ?? []} />
        <p>Commandes {seller.data && hostLinkActive(session, today) ? "ouvertes" : "fermées"}.</p>
        <HostLinks key={session.id} orderPath={"/hote/commande/" + session.order_token} trackingPath={"/hote/suivi/" + session.tracking_token} />
      </section>
      <section className={styles.panel}>
        <h2>Clients rattachés à cette session</h2>
        {affiliates.error ? <p role="alert">Le suivi des clients est temporairement indisponible.</p> :
          affiliates.count ? <><p>{affiliates.count} client(s) rattaché(s)</p><ul className={styles.trips}>
            {affiliates.data.map(client => <li key={client.client_id}><Link href={"/consultant/clients?client=" + client.client_id}>
              {client.crm_clients?.name ?? "Fiche client"}
            </Link></li>)}
          </ul></> : <p>Aucun client rattaché pour le moment.</p>}
      </section>
      {session.kind === "meeting" && session.delivery_mode === "grouped" && <section className={styles.panel}>
        <h2>Bon de livraison groupée</h2>
        <p>Livraison chez {session.host_name} · {session.delivery_address || session.venue}</p>
        {session.status === "closed" ?
          <Link className={styles.crmAction} href={"/api/consultant/hotes/" + session.id + "/livraison"}>Télécharger le bon groupé (PDF)</Link> :
          <p>Clôture la réunion pour obtenir le bon groupé des commandes rattachées.</p>}
      </section>}
      <ExistingOrders session={session} orders={orders.data} />
      <section className={styles.panel}>
        <h2>Bons rattachés</h2>
        {linkedOrders.error ? <p role="alert">Les bons sont temporairement indisponibles.</p> :
          linkedOrders.data.length ? <ul className={styles.trips}>{linkedOrders.data.map(order => <li key={order.id}>
            <Link href={"/consultant/clients?" + new URLSearchParams({ client: order.client_id, view: "history" })}>
              {receiptNumber(order.id)}
            </Link> · {formatDate(order.order_date)} · {new Map(orderStatuses).get(order.status)} · {new Map(paymentStatuses).get(order.payment_status)}
            {order.total_cents != null && " · " + formatEuros(order.total_cents + order.shipping_cents)}
            {session.delivery_mode === "individual" && <div style={{ whiteSpace: "pre-line" }}>
              {order.delivery_address || "Adresse de livraison à confirmer"}
            </div>}
          </li>)}</ul> : <p>Aucun bon rattaché pour le moment.</p>}
      </section>
      <section className={styles.panel}>
        {sales.error || gifts.error ? <p role="alert">Les ventes et cadeaux sont temporairement indisponibles.</p> :
          <HostSummary sales={sales.data} gifts={gifts.data} session={session} />}
        <form action={manageGift} className={styles.form}>
          <input type="hidden" name="session_id" value={session.id} />
          <input type="hidden" name="operation" value="add" />
          <label>Cadeau<input name="label" maxLength={160} required /></label>
          <label>Palier de chiffre d’affaires (€)<input name="threshold" inputMode="decimal" required /></label>
          <button>Ajouter le palier</button>
        </form>
      </section>
    </>}
  </main>;
}
