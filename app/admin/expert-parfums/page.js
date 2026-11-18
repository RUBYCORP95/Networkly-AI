import Link from "next/link";
import { perfumeSession, loadCatalogue } from "../../../lib/parfums/server";
import { findPerfumes } from "../../../lib/parfums/expert.mjs";
import PerfumeForm from "./Form";
import styles from "../../expert-parfums/parfums.module.css";

export const metadata = { title: "Administration Expert Parfums · TESAMI" };

export default async function AdminPerfumes({ searchParams }) {
  const { supabase } = await perfumeSession(true);
  const { catalogue, unavailable } = await loadCatalogue(supabase, true);
  const { ref, q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const perfume = catalogue.find(row => row.reference === ref);
  const matches = findPerfumes(catalogue, query);

  return <main className={styles.shell}>
    <nav className={styles.nav}><Link href="/expert-parfums">← Expert Parfums</Link><Link href="/admin">Administration TESAMI</Link></nav>
    <h1>Administration des parfums Olfazeta</h1>
    {unavailable ? <p role="alert">Le catalogue est temporairement indisponible.</p> : <>
      <form className={styles.card}>
        <label className={styles.field}>Chercher une fiche<input name="q" type="search" defaultValue={query} /></label>
        <button type="submit">Rechercher</button> <Link href="/admin/expert-parfums">Nouvelle fiche</Link>
        <details open={Boolean(query)}>
          <summary>{matches.length} fiche(s)</summary>
          <ul>{matches.map(item => <li key={item.reference}><Link href={`?ref=${item.reference}&q=${encodeURIComponent(query)}`}>
            {item.reference} · {item.nom}{!item.publie && " (brouillon)"}</Link></li>)}</ul>
        </details>
      </form>
      <PerfumeForm key={perfume?.reference ?? "new"} perfume={perfume} />
    </>}
  </main>;
}
