import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { availableSharedOrder } from "../../../../lib/crm/host-public";
import { meetingDeliveryModes, meetingShippingRate } from "../../../../lib/crm/hosts.mjs";
import { priceOrder, readLines } from "../../../../lib/crm/order";
import { meetingPromoCode } from "../../../../lib/crm/meeting-promo.mjs";
import { readPublicCustomer } from "../../../../lib/crm/public-customer.mjs";
import PublicCustomerFields from "../../../consultant/clients/PublicCustomerFields";
import OrderForm from "../../../consultant/clients/OrderForm";
import { SellerDetails } from "../../../consultant/clients/OrderReceipt";
import styles from "../../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commande hôte · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function submit(token, requestId, form) {
  "use server";
  const path = "/hote/commande/" + token;
  const link = await availableSharedOrder(token);
  if (!link) redirect(path);
  const customer = readPublicCustomer(form);
  const destination = String(form.get("delivery_address") ?? "").trim();
  const selected_mode = link.session?.kind === "meeting" ? String(form.get("meeting_delivery_mode") ?? "") : null;
  if ((selected_mode !== null && !Object.hasOwn(meetingDeliveryModes, selected_mode)) ||
      (selected_mode === "individual" && (destination.length < 5 || destination.length > 500))) redirect(path + "?erreur=1");
  const enteredCode = String(form.get("promo_code") ?? "").trim();
  const promo_code = meetingPromoCode(enteredCode);
  if (enteredCode && (selected_mode === null || !promo_code)) redirect(path + "?promo=invalide");
  const lines = readLines(form.get("lines"));
  if (!customer || !lines?.length) redirect(path + "?erreur=1");
  let priced;
  try { priced = await priceOrder(lines); }
  catch { redirect(path + "?erreur=1"); }
  const { data, error } = await link.db.rpc("submit_crm_delivery_choice", {
    invite: token, request_id: requestId, ...customer,
    subtotal: priced.total, order_items: priced.items, destination: destination || null, selected_mode, promo_code,
  });
  if (error?.message === "Meeting promo is unavailable") redirect(path + "?promo=invalide");
  if (error || !data) redirect(path + "?erreur=1");
  redirect("/hote/commande/envoye");
}

export default async function HostOrder({ params, searchParams }) {
  const { token } = await params;
  if (token === "envoye") return <main className={styles.page}><h1>Bon de commande envoyé</h1>
    <p>Ton consultant a reçu ta demande et pourra te confirmer le paiement.</p></main>;
  const [link, query] = await Promise.all([availableSharedOrder(token), searchParams]);
  const meeting = link?.session?.kind === "meeting" ? link.session : null;
  const deliveryOptions = meeting && Object.entries(meetingDeliveryModes).map(([mode, label]) =>
    ({ mode, label, cents: meetingShippingRate(meeting, mode) }));
  return <main className={styles.page}>
    <h1>Bon de commande</h1>
    {link ? <>
      <section className={styles.panel}><h2>Ton consultant</h2><SellerDetails seller={link.seller} /></section>
      <p>Choisis tes produits puis renseigne tes coordonnées. Si tu as déjà une fiche, utilise le même prénom, nom et la même date de naissance.</p>
      <Link className={styles.crmAction} href={"/inscription-chogan/" + token}>Enregistrer mes coordonnées sans commander</Link>
      {query.promo && <p role="alert">Ce code promo est invalide ou a atteint son nombre maximum d’utilisations.</p>}
      {query.erreur && <p role="alert">Le bon n’a pas été envoyé. Vérifie tes informations et les produits choisis, ou contacte ton consultant.</p>}
      <OrderForm token={token} fixedShipping={link.session?.shipping_cents ?? 0} deliveryOptions={deliveryOptions}
        defaultDeliveryMode={meeting?.delivery_mode} submitAction={submit.bind(null, token, randomUUID())}>
        <PublicCustomerFields host={Boolean(link.session)} />
      </OrderForm>
    </> : <p>Ce lien de commande est indisponible. Contacte ton consultant.</p>}
  </main>;
}
