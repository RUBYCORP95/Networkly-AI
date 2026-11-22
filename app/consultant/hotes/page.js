import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import { formatDate, parisDate } from "../../../lib/crm/dates.mjs";
import { hostCaseStatuses, hostKinds, hostLinkActive, hostStatuses, hostUuid, meetingDeliveryModes, meetingOrderDeliveryMode, meetingOrderReviewed, meetingShippingRate } from "../../../lib/crm/hosts.mjs";
import { readMeetingOrders } from "../../../lib/crm/meeting-orders";
import { formatEuros } from "../../../lib/crm/money.mjs";
import { orderStatuses, paymentStatuses, receiptNumber } from "../../../lib/crm/order-receipt.mjs";
import styles from "../consultant.module.css";
import { attachOrder, closeMeeting, manageGift, manageMeetingPromo, reviewMeetingOrder, saveHost, saveMeetingOrderGift } from "./actions";
import HostLinks from "./HostLinks";
import HostSummary from "./HostSummary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hôte / Hôtesse · TESAMI" };

const root = "/consultant/hotes";
const notices = {
  saved: "Enregistré.",
  "promo-saved": "Code promo enregistré.",
  "promo-duplicate": "Ce code existe déjà pour cette réunion.",
  "gift-saved": "Cadeau mis à jour.",
  "meeting-closed": "Réunion clôturée.",
  "addresses-required": "Renseigne l’adresse sur chaque bon avant de choisir la livraison chez les clients.",
  "payment-reviewed": "Paiement du bon validé.",
  "review-required": "Valide le paiement de chaque bon avant de clôturer la réunion.",
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
      <label>Prix par bon livré chez l’hôte (€)
        <input name="grouped_shipping" inputMode="decimal" required
          defaultValue={((session?.grouped_shipping_cents ?? (session?.delivery_mode === "grouped" ? session.shipping_cents : 0)) / 100).toFixed(2)} />
        <small>Indique 0 € pour proposer la livraison gratuite chez l’hôte.</small>
      </label>
      <label>Prix par bon livré chez le client (€)
        <input name="individual_shipping" inputMode="decimal" required
          defaultValue={((session?.individual_shipping_cents ?? session?.shipping_cents ?? 0) / 100).toFixed(2)} />
      </label>
      <label>Invités (un par ligne)<textarea name="guests" maxLength={4000} defaultValue={session?.guests} rows={3} /></label>
    </>}
    <label>Statut<select name="status" defaultValue={session?.status ?? "planned"}>
      {Object.entries(isCase ? hostCaseStatuses : hostStatuses)
        .filter(([value]) => isCase || value !== "closed" || session?.status === "closed")
        .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {isCase && <label>Livraison par commande (€)<input name="shipping" inputMode="decimal"
      defaultValue={session ? (session.shipping_cents / 100).toFixed(2) : "0,00"} /></label>}
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
        {orders.map(order => <option key={order.id} value={order.id}>{receiptNumber(order)} · {formatDate(order.order_date)}
          {order.total_cents != null ? " · " + formatEuros(order.total_cents + order.shipping_cents) : ""}</option>)}
      </select></label>
      <button>Rattacher le bon</button>
    </form> : <p>Aucun bon disponible à rattacher.</p>}
  </section>;
}

function MeetingPromos({ session, promos, orders }) {
  const editable = !["closed", "cancelled"].includes(session.status);
  const uses = new Map();
  for (const order of orders) {
    if (order.meeting_promo_id) uses.set(order.meeting_promo_id, (uses.get(order.meeting_promo_id) ?? 0) + 1);
  }
  return <section className={styles.panel}>
    <h2>Codes promo de la réunion</h2>
    <p>Communique le code aux clients concernés. Ils pourront le saisir sur leur bon de commande.</p>
    {promos.error ? <p role="alert">Les codes promo sont temporairement indisponibles.</p> :
      <ul className={styles.trips}>{promos.data.map(promo => <li key={promo.id}>
        <strong>{promo.code}</strong> · {promo.discount_bp / 100} % · {uses.get(promo.id) ?? 0}{promo.max_uses ? " / " + promo.max_uses : ""} utilisation(s)
        {editable && <form action={manageMeetingPromo} className={styles.orderActions}>
          <input type="hidden" name="session_id" value={session.id} />
          <input type="hidden" name="promo_id" value={promo.id} />
          <input type="hidden" name="active" value={String(!promo.active)} />
          <button>{promo.active ? "Désactiver le code" : "Réactiver le code"}</button>
        </form>}
      </li>)}</ul>}
    {editable && <form action={manageMeetingPromo} className={styles.form}>
      <input type="hidden" name="session_id" value={session.id} />
      <label>Code à communiquer<input name="code" minLength={3} maxLength={30} required placeholder="Ex. REUNION10" /></label>
      <label>Remise (%)<input name="discount_percent" type="number" min="0.01" max="100" step="0.01" required /></label>
      <label>Nombre maximum d’utilisations<input name="max_uses" type="number" min="1" max="99999" placeholder="Vide = illimité" /></label>
      <button>Créer le code promo</button>
    </form>}
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
    .select("id,kind,host_name,host_client_id,starts_on,ends_on,venue,guests,status,shipping_cents,grouped_shipping_cents,individual_shipping_cents,delivery_mode,delivery_address,order_token,tracking_token").eq("id", id).eq("kind", kind).maybeSingle() : {};
  const [sales, gifts, orders, linkedOrders, affiliates, promos] = session ? await Promise.all([
    db.from("crm_host_sales").select("paid_orders,paid_cents").eq("session_id", id).maybeSingle(),
    db.from("crm_host_gifts").select("id,label,threshold_cents,delivered_at").eq("session_id", id).order("threshold_cents"),
    (order ? db.from("crm_orders").select("id,order_number,order_date,total_cents,shipping_cents").eq("id", order).is("host_session_id", null)
      : db.from("crm_orders").select("id,order_number,order_date,total_cents,shipping_cents").is("host_session_id", null).order("order_date", { ascending: false }).limit(30)),
    kind === "meeting" ? readMeetingOrders(db, id, { includeCancelled: true }) :
      db.from("crm_orders").select("id,order_number,client_id,order_date,total_cents,shipping_cents,status,payment_status")
        .eq("host_session_id", id).order("order_date", { ascending: false }).order("id").limit(30),
    db.from("crm_host_clients").select("client_id,crm_clients(name)", { count: "exact" }).eq("session_id", id).order("client_id").limit(30),
    kind === "meeting" ? db.from("crm_meeting_promos").select("id,code,discount_bp,max_uses,active").eq("session_id", id).order("code") : null,
  ]) : [];

  const reviewedOrders = linkedOrders?.data ?? [];
  const remaining = kind === "meeting" ? reviewedOrders.filter(order => order.status !== "cancelled" && !meetingOrderReviewed(order)).length : 0;
  const grouped = kind === "meeting" && reviewedOrders.filter(order => order.status !== "cancelled" && meetingOrderDeliveryMode(order, session) === "grouped");
  const canClose = kind !== "meeting" || (!linkedOrders?.error && remaining === 0);

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
    {order && !session && <p>Sélectionne la session à laquelle rattacher ce bon.</p>}
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
      {kind === "meeting" && <MeetingPromos session={session} promos={promos} orders={reviewedOrders} />}
      <section className={styles.panel}>
        <h2>Clients rattachés à cette session</h2>
        {affiliates.error ? <p role="alert">Le suivi des clients est temporairement indisponible.</p> :
          affiliates.count ? <><p>{affiliates.count} client(s) rattaché(s)</p><ul className={styles.trips}>
            {affiliates.data.map(client => <li key={client.client_id}><Link href={"/consultant/clients?client=" + client.client_id}>
              {client.crm_clients?.name ?? "Fiche client"}
            </Link></li>)}
          </ul></> : <p>Aucun client rattaché pour le moment.</p>}
      </section>
      {grouped?.length > 0 && <section className={styles.panel}>
        <h2>Bon de livraison groupée</h2>
        <p>Livraison chez {session.host_name} · {session.delivery_address || session.venue}</p>
        {session.status === "closed" && grouped.every(meetingOrderReviewed) ?
          <Link className={styles.crmAction} href={"/api/consultant/hotes/" + session.id + "/livraison"}>Télécharger le bon groupé (PDF)</Link> :
          <p>{session.status === "closed" ? "Valide les paiements pour actualiser le bon groupé." :
            "Valide les paiements puis clôture la réunion pour obtenir le bon groupé."}</p>}
      </section>}
      {!(kind === "meeting" && session.status === "closed") && <ExistingOrders session={session} orders={orders.data} />}
      <section className={styles.panel}>
        <h2>{kind === "meeting" ? "Validation des bons rattachés" : "Bons rattachés"}</h2>
        {kind === "meeting" && remaining > 0 && <p className={styles.notice}>
          {remaining} bon(s) à valider. Choisis « Payé » ou « À payer plus tard » pour chacun.
        </p>}
        {linkedOrders.error ? <p role="alert">Les bons sont temporairement indisponibles.</p> :
          linkedOrders.data.length ? <ul className={styles.trips}>{linkedOrders.data.map(order => <li key={order.id}>
            <Link href={"/consultant/clients?" + new URLSearchParams({ client: order.client_id, view: "history" })}>
              {receiptNumber(order)}{order.buyer?.name ? " · " + order.buyer.name : ""}
            </Link> · {formatDate(order.order_date)} · {new Map(orderStatuses).get(order.status)} · {new Map(paymentStatuses).get(order.payment_status)}
            {order.total_cents != null && " · " + formatEuros(order.total_cents + order.shipping_cents)}
            {kind === "meeting" && <div className={styles.orderActions}>
              <span>{meetingDeliveryModes[meetingOrderDeliveryMode(order, session)] || "Livraison à préciser"} · {formatEuros(order.shipping_cents)}</span>
              <Link className={styles.crmAction} href={"/consultant/clients?" + new URLSearchParams({ client: order.client_id, view: "history", edit: order.id })}>Modifier le bon</Link>
              {session.status === "closed" && order.status !== "cancelled" && meetingOrderDeliveryMode(order, session) === "individual" &&
                <a className={styles.crmAction} href={"/api/consultant/orders/" + order.id + "/pdf"}>Télécharger le bon individuel (PDF)</a>}
            </div>}
            {kind === "meeting" && order.status !== "cancelled" && <details>
              <summary>{order.gift_product ? "Cadeau offert · " + order.gift_quantity + " × " + order.gift_product : "Ajouter un cadeau"}</summary>
              <form action={saveMeetingOrderGift} className={styles.form}>
                <input type="hidden" name="session_id" value={session.id} />
                <input type="hidden" name="order_id" value={order.id} />
                <label>Nom du produit offert<input name="gift_product" maxLength={220} defaultValue={order.gift_product ?? ""} /></label>
                <label>Quantité offerte<input name="gift_quantity" type="number" min="1" max="999" defaultValue={order.gift_quantity ?? 1} /></label>
                <button>Enregistrer le cadeau</button>
              </form>
            </details>}
            {kind === "meeting" && order.status !== "cancelled" && session.status !== "cancelled" && <form action={reviewMeetingOrder} className={styles.orderActions}>
              <input type="hidden" name="session_id" value={session.id} />
              <input type="hidden" name="order_id" value={order.id} />
              <label>Adresse de livraison chez le client (si nécessaire)
                <textarea name="delivery_address" minLength={5} maxLength={500} rows={2} defaultValue={order.delivery_address ?? ""} />
              </label>
              <span>{meetingOrderReviewed(order) ? "Paiement validé" : "Paiement à valider"}</span>
              <button name="payment" value="paid">Valider comme payé</button>
              <button name="payment" value="later">Valider comme à payer plus tard</button>
            </form>}
          </li>)}</ul> : <p>Aucun bon rattaché pour le moment.</p>}
      </section>
      {kind === "meeting" && ["planned", "active"].includes(session.status) && <section className={styles.panel}>
        <h2>Validation finale de la réunion</h2>
        {!canClose && <p>Valide chaque bon rattaché pour pouvoir clôturer la réunion.</p>}
        <form className={styles.form} action={closeMeeting}>
          <input type="hidden" name="session_id" value={session.id} />
          <p>Les choix et les frais de livraison des clients sont conservés. Ce mode s’applique aux anciens bons sans choix de livraison.</p>
          <label>Mode de livraison pour les bons sans choix<select name="delivery_mode" defaultValue={session.delivery_mode ?? ""} required>
            <option value="" disabled>Choisir le mode de livraison</option>
            {Object.entries(meetingDeliveryModes).map(([value, label]) =>
              <option key={value} value={value}>{label} · {formatEuros(meetingShippingRate(session, value))} par bon</option>)}
          </select></label>
          <label>Adresse de livraison chez l’hôte (si différente du lieu)
            <textarea name="delivery_address" maxLength={500} rows={2} defaultValue={session.delivery_address ?? ""} />
          </label>
          <button disabled={!canClose}>Valider et clôturer la réunion</button>
        </form>
      </section>}
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
