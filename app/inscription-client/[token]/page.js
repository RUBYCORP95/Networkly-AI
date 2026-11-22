import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { orderLinkHash } from "../../../lib/crm/order-link";
import { readPublicCustomer } from "../../../lib/crm/public-customer.mjs";
import PublicCustomerFields from "../../consultant/clients/PublicCustomerFields";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import styles from "../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscription client · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function register(token, form) {
  "use server";
  const hash = orderLinkHash(token);
  if (!hash) redirect("/inscription-client/invalide");
  const path = "/inscription-client/" + token;
  const customer = readPublicCustomer(form);
  if (!customer || customer.customer_phone.replace(/\D/g, "").length < 6) redirect(path + "?erreur=1");
  const orderToken = randomBytes(32).toString("base64url");
  const {data, error} = await createAdminSupabase().rpc("register_crm_customer_with_identity", {
    invite_hash: hash, next_hash: orderLinkHash(orderToken), ...customer,
  });
  if (error) redirect(path + "?erreur=1");
  if (!data) redirect("/inscription-client/invalide");
  redirect("/commande/" + orderToken);
}

export default async function ClientRegistration({params, searchParams}) {
  const {token} = await params;
  const query = await searchParams;
  const hash = orderLinkHash(token);
  const invite = hash && await createAdminSupabase().from("crm_registration_links")
    .select("expires_at").eq("token_hash", hash).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();

  return <main className={styles.page}>
    <h1>Inscription client</h1>
    {invite?.error ? <p role="alert">L’inscription est temporairement indisponible.</p> :
      !invite?.data ? <p>Ce lien est expiré ou déjà utilisé. Demande un nouveau lien à ton consultant.</p> :
      <section className={styles.panel}>
        <p>Renseigne tes coordonnées pour accéder au bon de commande CHOGAN.</p>
        {query.erreur && <p role="alert">L’inscription n’a pas abouti. Vérifie tes informations et réessaie.</p>}
        <form className={styles.form} action={register.bind(null, token)}>
          <PublicCustomerFields requirePhone />
          <button>Continuer vers le bon de commande</button>
        </form>
      </section>}
  </main>;
}
