import Link from "next/link";
import { createServerSupabase } from "../../../lib/supabase/server";
import styles from "../../recrutement/recruitment.module.css";
import Workspace from "./Workspace";

export const metadata = { title: "Recrutement intelligent · TESAMI" };

export default async function Page() {
  const db = await createServerSupabase();
  const { data, error } = await db.rpc("can_use_recruitment");
  return <main className={`${styles.workspace} ${styles.consultantWorkspace}`}>
    <Link href="/consultant">← Espace Consultant</Link>
    <h1>Recrutement intelligent</h1>
    {data ? <Workspace /> : <p>{error ? "Accès temporairement indisponible." : "Ce module est désactivé pour ton compte."}</p>}
  </main>;
}
