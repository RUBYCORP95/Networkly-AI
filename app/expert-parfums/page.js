import Link from "next/link";
import { loadCatalogue } from "../../lib/parfums/server";
import { createServerSupabase } from "../../lib/supabase/server";
import Expert from "./Expert";
import styles from "./parfums.module.css";

export const metadata = { title: "Expert Parfums · TESAMI" };

export default async function ExpertPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const { catalogue, unavailable } = await loadCatalogue(supabase);
  const { data: history, error } = user
    ? await supabase.from("expert_parfums_historique").select("id,created_at,public_cible,preferences,resultats,reference_depart,parfum_depart")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30)
    : { data: [], error: null };
  const { data: profile } = user ? await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle() : { data: null };

  return <main className={styles.shell}>
    <nav className={styles.nav}><Link href="/">← Tableau de bord</Link>
      {profile?.is_admin && <Link href="/admin/expert-parfums">Administrer le catalogue</Link>}
    </nav>
    <header className={styles.hero}>
      <h1>Expert Parfums</h1>
      <p>Recherche ton parfum parmi 1 479 références multimarques, puis découvre les parfums Olfazeta qui partagent ses notes.</p>
    </header>
    {unavailable ? <p role="alert">Le catalogue est temporairement indisponible.</p> :
      <Expert catalogue={catalogue} history={history ?? []} historyUnavailable={Boolean(error)} signedIn={Boolean(user)} />}
  </main>;
}
