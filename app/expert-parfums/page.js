import Link from "next/link";
import { perfumeSession, loadCatalogue } from "../../lib/parfums/server";
import Expert from "./Expert";
import styles from "./parfums.module.css";

export const metadata = { title: "Expert Parfums · TESAMI" };

export default async function ExpertPage() {
  const { supabase, user, profile } = await perfumeSession();
  const [{ catalogue, unavailable }, { data: history, error }] = await Promise.all([
    loadCatalogue(supabase),
    supabase.from("expert_parfums_historique").select("id,created_at,public_cible,preferences,resultats,reference_depart")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);

  return <main className={styles.shell}>
    <nav className={styles.nav}><Link href="/">← Tableau de bord</Link>
      {profile.is_admin && <Link href="/admin/expert-parfums">Administrer le catalogue</Link>}
    </nav>
    <header className={styles.hero}>
      <h1>Expert Parfums</h1>
      <p>Recherche ton parfum parmi 1 479 références multimarques, puis découvre les parfums Olfazeta qui partagent ses notes.</p>
    </header>
    {unavailable ? <p role="alert">Le catalogue est temporairement indisponible.</p> :
      <Expert catalogue={catalogue} history={history ?? []} historyUnavailable={Boolean(error)} />}
  </main>;
}
