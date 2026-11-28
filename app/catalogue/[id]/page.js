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
    <Storefront key={id + (token ?? "")} id={id} token={token} products={products}
      consultant={seller.name} context={context?.kind} />
    <footer id="contact" className={styles.footer}>
      <div className={styles.footerInner}>
        <div>
          <h2>Contacter {seller.name}</h2>
          {seller.business && <p>{seller.business}</p>}
        </div>
        <div className={styles.footerLinks}>
          <a href={"mailto:" + encodeURIComponent(seller.email)}>{seller.email}</a>
          {seller.phone && <a href={"tel:" + seller.phone.replace(/[^+0-9]/g, "")}>{seller.phone}</a>}
        </div>
      </div>
    </footer>
  </main>;
}
