import Link from "next/link";
import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { parisDate } from "../../../lib/crm/dates.mjs";
import { hostLinkActive } from "../../../lib/crm/hosts.mjs";
import { cataloguePath } from "../../../lib/public-catalogue/server";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { createServerSupabase } from "../../../lib/supabase/server";
import styles from "../consultant.module.css";
import { configureCatalogue } from "./actions";
import ShareCatalogue from "./ShareCatalogue";

export const metadata = { title: "Mon catalogue · TESAMI" };

const messages = {
  saved: "Catalogue enregistré.",
  seller: "Renseigne tes coordonnées professionnelles.",
  invalid: "Vérifie le montant de la livraison.",
  failed: "Le catalogue n’a pas pu être enregistré.",
};

export default async function Page({ searchParams }) {
  const client = await createServerSupabase();
  const access = await requireConsultant(client);
  if (!access.ok) redirect("/");
  const db = createAdminSupabase();
  const owner = access.user.id;
  const since = new Date(Date.now() - 29 * 86400000);
  const [catalogue, seller, hosts, counts] = await Promise.all([
    db.from("public_catalogues").select("id,enabled,shipping_cents").eq("owner_id", owner).maybeSingle(),
    client.from("crm_seller_profiles").select("name").eq("owner_id", owner).maybeSingle(),
    client.from("crm_host_sessions").select("order_token,host_name,kind,status,starts_on,ends_on")
      .eq("owner_id", owner).eq("status", "active").order("starts_on", { ascending: false }),
    db.from("public_catalogue_daily").select("visits,orders").eq("owner_id", owner).gte("day", parisDate(since)),
  ]);
  if (catalogue.error || seller.error || hosts.error || counts.error) throw new Error("Catalogue indisponible");

  const config = catalogue.data;
  const result = (await searchParams).result;
  const activeHosts = hosts.data.filter(host => hostLinkActive(host, parisDate()));
  const origin = process.env.VERCEL_ENV === "production" ? "https://app.tesami.fr" :
    process.env.NEXT_PUBLIC_APP_URL || "https://app.tesami.fr";
  const totals = counts.data.reduce((sum, row) => ({ visits: sum.visits + row.visits, orders: sum.orders + row.orders }),
    { visits: 0, orders: 0 });

  return <main className={styles.page}>
    <Link href="/consultant">← Espace consultant</Link>
    <h1>Mon catalogue</h1>
    {Object.hasOwn(messages, result) && <p role="status">{messages[result]}</p>}
    {!seller.data && <p><Link href="/consultant/clients?view=settings">Renseigne tes coordonnées professionnelles</Link> pour ouvrir ton catalogue.</p>}
    {!config && seller.data && <form action={configureCatalogue}>
      <input type="hidden" name="initialize" value="yes" />
      <button>Créer mon catalogue public</button>
    </form>}
    {config && <>
      <section className={styles.panel}>
        <h2>Lien permanent</h2>
        {!config.enabled && <p>Ce catalogue a été désactivé par l’administration.</p>}
        <ShareCatalogue url={new URL(cataloguePath(config.id), origin).href} />
      </section>
      <section className={styles.panel}>
        <h2>Livraison à domicile</h2>
        <form action={configureCatalogue} className={styles.form}>
          <label>Frais de livraison (€)<input name="shipping" type="number" min="0" max="999999.99" step=".01"
            defaultValue={(config.shipping_cents / 100).toFixed(2)} required /></label>
          <button>Enregistrer les frais de livraison</button>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Réunions et mallettes actives</h2>
        {activeHosts.length ? <ul>{activeHosts.map(host => {
          const url = new URL(cataloguePath(config.id, host.order_token), origin).href;
          const label = (host.kind === "meeting" ? "Réunion" : "Mallette") + " · " + host.host_name;
          return <li key={host.order_token}><a href={url}>{label}</a>{" · "}
            <a href={"https://wa.me/?text=" + encodeURIComponent(label + " : " + url)} target="_blank" rel="noopener noreferrer">Partager sur WhatsApp</a></li>;
        })}</ul> : <p>Aucune session active. <Link href="/consultant/hotes">Gérer mes sessions</Link></p>}
      </section>
      <section className={styles.panel}>
        <h2>30 derniers jours</h2>
        <p>{totals.visits} visites · {totals.orders} commandes transmises</p>
      </section>
    </>}
  </main>;
}
