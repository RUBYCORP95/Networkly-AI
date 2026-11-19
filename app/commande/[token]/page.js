import { redirect } from "next/navigation";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { availableOrderLink, orderLinkHash } from "../../../lib/crm/order-link";
import { priceOrder, readLines } from "../../../lib/crm/order";
import { SellerDetails } from "../../consultant/clients/OrderReceipt";
import OrderForm from "../../consultant/clients/OrderForm";
import styles from "../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bon de commande · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function submitOrder(token, form) {
  "use server";
  const hash = orderLinkHash(token);
  const link = hash && await availableOrderLink(token);
  if (!link) redirect("/commande/" + token);
  const lines = readLines(form.get("lines"));
  if (!lines?.length) redirect("/commande/" + token + "?erreur=1");

  let priced;
  try { priced = await priceOrder(lines); }
  catch { redirect("/commande/" + token + "?erreur=1"); }
  const { data, error } = await createAdminSupabase().rpc("submit_crm_order", {
    link_hash: hash, order_details: "Bon envoyé par le client", subtotal: priced.total, order_items: priced.items,
  });
  if (error) redirect("/commande/" + token + "?erreur=1");
  redirect(data ? "/commande/envoye" : "/commande/" + token);
}

export default async function PublicOrder({ params, searchParams }) {
  const { token } = await params;
  if (token === "envoye") return <main className={styles.page}><h1>Bon de commande envoyé</h1><p>Ton consultant a reçu ta demande.</p></main>;
  const link = await availableOrderLink(token);
  const query = await searchParams;
  return <main className={styles.page}>
    <h1>Bon de commande</h1>
    {link ? <>
      <section className={styles.panel}><h2>Ton consultant</h2><SellerDetails seller={link.seller} /></section>
      <p>Ajoute tes produits, ajuste les quantités, puis envoie ton bon à ton consultant.</p>
      {query.erreur && <p role="alert">Le bon n’a pas été envoyé. Vérifie la disponibilité des produits et réessaie.</p>}
      <OrderForm token={token} fixedShipping={link.shipping_cents} submitAction={submitOrder.bind(null, token)} />
    </> : <p>Ce lien est expiré ou déjà utilisé. Demande un nouveau lien à ton consultant.</p>}
  </main>;
}
