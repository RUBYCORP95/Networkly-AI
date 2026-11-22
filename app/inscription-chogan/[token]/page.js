import Link from "next/link";
import { redirect } from "next/navigation";
import { availableSharedOrder } from "../../../lib/crm/host-public";
import { readPublicCustomer } from "../../../lib/crm/public-customer.mjs";
import PublicCustomerFields from "../../consultant/clients/PublicCustomerFields";
import styles from "../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fiche client Chogan · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

async function register(token, form) {
  "use server";
  const path = "/inscription-chogan/" + token;
  const link = await availableSharedOrder(token);
  if (!link) redirect(path);
  const customer = readPublicCustomer(form);
  if (!customer) redirect(path + "?erreur=1");
  const { data, error } = await link.db.rpc("register_crm_customer_invite", { invite: token, ...customer });
  if (error || !data) redirect(path + "?erreur=1");
  redirect(path + "?confirmation=1");
}

export default async function Registration({ params, searchParams }) {
  const { token } = await params;
  const [link, query] = await Promise.all([availableSharedOrder(token), searchParams]);
  const orderPath = "/hote/commande/" + token;
  return <main className={styles.page}>
    <h1>Fiche client Chogan</h1>
    {!link ? <p>Ce lien est indisponible. Contacte ton consultant.</p> : <section className={styles.panel}>
      <h2>{link.seller.business || link.seller.name}</h2>
      {query.confirmation ? <p role="status">Tes coordonnées ont été enregistrées.</p> : <>
        <p>Renseigne tes coordonnées pour que ton consultant retrouve ta fiche lors de tes commandes.</p>
        {query.erreur && <p role="alert">Tes coordonnées n’ont pas été enregistrées. Vérifie-les ou contacte ton consultant.</p>}
        <form className={styles.form} action={register.bind(null, token)}>
          <PublicCustomerFields host={Boolean(link.session)} />
          <button>Enregistrer mes coordonnées</button>
        </form>
      </>}
      <p><Link className={styles.crmAction} href={orderPath}>Accéder au bon de commande</Link></p>
    </section>}
  </main>;
}
