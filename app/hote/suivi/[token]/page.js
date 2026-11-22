import Link from "next/link";
import { hostTracking } from "../../../../lib/crm/host-public";
import { hostKinds, hostLinkActive } from "../../../../lib/crm/hosts.mjs";
import { parisDate } from "../../../../lib/crm/dates.mjs";
import HostSummary from "../../../consultant/hotes/HostSummary";
import styles from "../../../consultant/consultant.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suivi hôte · TESAMI", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function HostTracking({ params }) {
  const { token } = await params;
  const data = await hostTracking(token);
  if (!data) return <main className={styles.page}><h1>Suivi indisponible</h1><p>Demande le lien de suivi à ton consultant.</p></main>;
  const { session, sales, gifts } = data;
  return <main className={styles.page}>
    <h1>{hostKinds[session.kind]}</h1>
    <HostSummary sales={sales} gifts={gifts} />
    {hostLinkActive(session, parisDate()) && <Link className={styles.crmAction} href={"/hote/commande/" + session.order_token}>
      Ouvrir le lien à partager pour commander
    </Link>}
  </main>;
}
