import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { availableHostOrder } from "../../../../lib/crm/host-public";
import { priceOrder, readLines } from "../../../../lib/crm/order";
import OrderForm from "../../../consultant/clients/OrderForm";
import { SellerDetails } from "../../../consultant/clients/OrderReceipt";
import styles from "../../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commande hôte · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function submit(token, requestId, form) {
  "use server";
  const path = "/hote/commande/" + token;
  const link = await availableHostOrder(token);
  if (!link) redirect(path);
  const customer_name = String(form.get("customer_name") ?? "").trim();
  const customer_email = String(form.get("customer_email") ?? "").trim();
  const customer_phone = String(form.get("customer_phone") ?? "").trim();
  const lines = readLines(form.get("lines"));
  if (!customer_name || customer_name.length > 120 || customer_email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email) || customer_phone.length > 40 || !lines?.length) redirect(path + "?erreur=1");
  let priced;
  try { priced = await priceOrder(lines); }
  catch { redirect(path + "?erreur=1"); }
  const { data, error } = await link.db.rpc("submit_crm_host_order", {
    link_token: token, request_id: requestId, customer_name, customer_email, customer_phone,
    subtotal: priced.total, order_items: priced.items,
  });
  if (error || !data) redirect(path + "?erreur=1");
  redirect("/hote/commande/envoye");
}

export default async function HostOrder({ params, searchParams }) {
  const { token } = await params;
  if (token === "envoye") return <main className={styles.page}><h1>Bon de commande envoyé</h1>
    <p>Ton consultant a reçu ta demande et pourra te confirmer le paiement.</p></main>;
  const [link, query] = await Promise.all([availableHostOrder(token), searchParams]);
  return <main className={styles.page}>
    <h1>Bon de commande</h1>
    {link ? <>
      <section className={styles.panel}><h2>Ton consultant</h2><SellerDetails seller={link.seller} /></section>
      <p>Choisis tes produits puis envoie ton bon à ton consultant.</p>
      {query.erreur && <p role="alert">Le bon n’a pas été envoyé. Vérifie tes coordonnées et la disponibilité des produits.</p>}
      <OrderForm token={token} fixedShipping={link.session.shipping_cents} submitAction={submit.bind(null, token, randomUUID())}>
        <label>Nom<input name="customer_name" autoComplete="name" maxLength={120} required /></label>
        <label>E-mail<input name="customer_email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Téléphone (facultatif)<input name="customer_phone" type="tel" autoComplete="tel" maxLength={40} /></label>
      </OrderForm>
    </> : <p>Ce lien de commande est indisponible. Contacte ton consultant.</p>}
  </main>;
}
