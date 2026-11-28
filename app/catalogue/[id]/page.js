import { notFound } from "next/navigation";
import { publicCatalogue } from "../../../lib/public-catalogue/server";
import Storefront from "./Storefront";
import styles from "./catalogue.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Catalogue Chogan · TESAMI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params, searchParams }) {
  const { id } = await params;
  const token = (await searchParams).contexte ?? null;
  const catalogue = await publicCatalogue(id, token);
  if (!catalogue) notFound();

  const products = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await catalogue.db.from("public_catalogue_products")
      .select("id,reference,category,title,format,description,notes,photo_url,photo_alt,unit_cents,available")
      .eq("visible", true).eq("verified", true).order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    products.push(...data);
    if (data.length < pageSize) break;
  }

  const { seller, context } = catalogue;
  return <main className={styles.store}>
    <header className={styles.header}>
      <a href="#produits" className={styles.wordmark}>TESAMI</a>
      <a href="#contact">Contact</a>
      <a href="#panier">Panier</a>
    </header>
    <section className={styles.hero}>
      <p>{context?.kind === "meeting" ? "Catalogue de la réunion" : context?.kind === "case" ? "Catalogue de la mallette" : "CHOGAN"}</p>
      <h1>Le catalogue de {seller.name}</h1>
      <p>Parfums, beauté, bien-être et maison</p>
    </section>
    <Storefront key={id + (token ?? "")} id={id} token={token} products={products}
      meeting={context?.kind === "meeting"} />
    <footer id="contact" className={styles.footer}>
      <h2>Contacter {seller.name}</h2>
      {seller.business && <p>{seller.business}</p>}
      <a href={"mailto:" + encodeURIComponent(seller.email)}>{seller.email}</a>
      {seller.phone && <a href={"tel:" + seller.phone.replace(/[^+0-9]/g, "")}>{seller.phone}</a>}
    </footer>
  </main>;
}
