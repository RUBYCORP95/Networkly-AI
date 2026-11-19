import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { orderLinkHash } from "../../../lib/crm/order-link";
import { isDate, parisDate } from "../../../lib/crm/dates.mjs";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import styles from "../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscription client · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function register(token, form) {
  "use server";
  const hash = orderLinkHash(token);
  if (!hash) redirect("/inscription-client/invalide");
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim();
  const birth = String(form.get("birth_date") ?? "");
  const path = "/inscription-client/" + token;
  if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      phone.length > 40 || phone.replace(/\D/g, "").length < 6 ||
      (birth && (!isDate(birth) || birth > parisDate())) || form.get("consent") !== "on") {
    redirect(path + "?erreur=1");
  }
  const orderToken = randomBytes(32).toString("base64url");
  const {data, error} = await createAdminSupabase().rpc("register_crm_customer", {
    invite_hash: hash, next_hash: orderLinkHash(orderToken), customer_name: name,
    customer_email: email, customer_phone: phone, customer_birth: birth || null,
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
          <label>Nom complet<input name="name" autoComplete="name" maxLength={120} required /></label>
          <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>Téléphone<input name="phone" type="tel" autoComplete="tel" maxLength={40} required /></label>
          <label>Date de naissance (facultative)<input name="birth_date" type="date" autoComplete="bday" max={parisDate()} /></label>
          <label><input name="consent" type="checkbox" required /> J’accepte que mon consultant conserve mes coordonnées dans TESAMI pour gérer ma fiche et mes commandes, ainsi que ma date de naissance si je la renseigne.</label>
          <button>Continuer vers le bon de commande</button>
        </form>
      </section>}
  </main>;
}
