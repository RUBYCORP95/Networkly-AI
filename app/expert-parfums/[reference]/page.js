import Link from "next/link";
import { notFound } from "next/navigation";
import { perfumeSession } from "../../../lib/parfums/server";
import { catalogueFields } from "../../../lib/parfums/expert.mjs";
import Fiche from "../Fiche";
import styles from "../parfums.module.css";

export default async function PerfumePage({ params }) {
  const { reference } = await params;
  if (!/^[A-Z0-9-]{1,24}$/i.test(reference)) notFound();
  const { supabase } = await perfumeSession();
  const { data, error } = await supabase.from("expert_parfums_catalogue").select(catalogueFields)
    .eq("reference", reference.toUpperCase()).eq("publie", true).maybeSingle();
  if (!error && !data) notFound();

  return <main className={styles.shell}>
    <nav className={styles.nav}><Link href="/expert-parfums">← Expert Parfums</Link></nav>
    {error ? <p role="alert">Cette fiche est temporairement indisponible.</p> : <Fiche perfume={data} />}
  </main>;
}
