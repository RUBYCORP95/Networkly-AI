import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveUser } from "../../../lib/auth/active-user";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { createServerSupabase } from "../../../lib/supabase/server";
import { hostUuid } from "../../../lib/crm/hosts.mjs";
import { categories } from "../../../lib/public-catalogue/model.mjs";
import styles from "../../consultant/consultant.module.css";
import { saveProduct, savePromo, toggleCatalogue } from "./actions";

export const metadata = { title: "Administration du catalogue · TESAMI" };

const messages = {
  saved: "Modification enregistrée.",
  invalid: "Vérifie les champs obligatoires et les éléments de validation de la fiche.",
  failed: "Enregistrement impossible. Vérifie notamment que la référence est unique.",
};

function ProductForm({ product }) {
  return <form action={saveProduct} className={styles.form}>
    <input type="hidden" name="id" value={product?.id ?? ""} />
    <label>Référence Chogan<input name="reference" defaultValue={product?.reference} maxLength={80} required /></label>
    <label>Nom public<input name="title" defaultValue={product?.title} maxLength={180} required /></label>
    <label>Catégorie<select name="category" defaultValue={product?.category}>
      {Object.entries(categories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select></label>
    <label>Format<input name="format" defaultValue={product?.format} maxLength={80} /></label>
    <label>Prix TTC (€)<input name="price" type="number" step=".01" min="0" max="999999.99"
      defaultValue={product?.unit_cents == null ? undefined : (product.unit_cents / 100).toFixed(2)} required /></label>
    <label>Description<textarea name="description" defaultValue={product?.description} maxLength={3000} /></label>
    <label>Flacon Olfazeta<select name="bottle" defaultValue={product?.bottle ?? ""}>
      <option value="">Sélectionner pour les parfums Olfazeta</option><option value="noir">Homme · noir</option>
      <option value="blanc">Femme · blanc</option>
    </select></label>
    <label>Notes olfactives officielles<textarea name="notes" defaultValue={product?.notes} maxLength={1000} /></label>
    <label>URL HTTPS du visuel final<input name="photo_url" type="url" defaultValue={product?.photo_url} maxLength={1000} /></label>
    <label>Texte alternatif de l’image<input name="photo_alt" defaultValue={product?.photo_alt} maxLength={200} /></label>
    <label>Sources et droits d’utilisation (interne)<textarea name="source_note" defaultValue={product?.source_note} maxLength={1000} /></label>
    <p>Pour Olfazeta, conserve à l’identique le flacon de référence noir homme ou blanc femme, son bouchon marbré, sa bague cuivrée et son étiquette. Compose le décor selon les notes officielles. Écarte les noms des parfums d’inspiration. Pour les autres gammes, utilise les ingrédients ou usages vérifiés.</p>
    <p>Exclus les coffrets cadeaux, masques de protection, gants, accessoires secondaires, échantillons, kits consultants et supports publicitaires.</p>
    <label><input type="checkbox" name="verified" defaultChecked={product?.verified} /> J’ai vérifié le prix, l’éligibilité de la référence, le visuel et ses droits, ainsi que les notes ou les ingrédients publiés.</label>
    <label><input type="checkbox" name="available" defaultChecked={product?.available} /> Disponible à la commande</label>
    <label><input type="checkbox" name="visible" defaultChecked={product?.visible} /> Visible dans le catalogue public</label>
    <button>Enregistrer le produit</button>
  </form>;
}

export default async function Page({ searchParams }) {
  const access = await requireActiveUser(await createServerSupabase());
  if (access.status === 401) redirect("/login?next=/admin/catalogue");
  if (!access.ok || !access.profile.is_admin) redirect("/");
  const db = createAdminSupabase();
  const params = await searchParams;
  const term = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  let list = db.from("public_catalogue_products").select("id,reference,title,visible").order("reference").limit(51);
  if (term) list = list.ilike("reference", term.replace(/[\\_%]/g, "\\$&") + "%");
  const perfumeRef = typeof params.parfum === "string" ? params.parfum.trim().toUpperCase() : "";
  const [products, selected, promos, catalogue, perfume] = await Promise.all([
    list,
    /^[1-9][0-9]{0,17}$/.test(params.product) ? db.from("public_catalogue_products").select("*").eq("id", params.product).maybeSingle() : {},
    db.from("public_catalogue_promos").select("*").order("code").limit(50),
    typeof params.catalogue === "string" && hostUuid.test(params.catalogue)
      ? db.from("public_catalogues").select("id,enabled").eq("id", params.catalogue).maybeSingle() : {},
    /^[A-Z0-9-]{1,24}$/.test(perfumeRef) ? (await createServerSupabase()).from("expert_parfums_catalogue")
      .select("reference,nom,public_cible,tete,coeur,fond,source,source_page")
      .eq("publie", true).eq("reference", perfumeRef).maybeSingle() : {},
  ]);
  if (products.error || selected.error || promos.error || catalogue.error || perfume.error) throw new Error("Administration du catalogue indisponible");

  const source = perfume.data;
  const draft = source && {
    reference: source.reference,
    title: source.nom,
    category: "parfums",
    bottle: { homme: "noir", femme: "blanc" }[source.public_cible],
    notes: [["Tête", source.tete], ["Cœur", source.coeur], ["Fond", source.fond]]
      .filter(([, notes]) => notes.length).map(([level, notes]) => level + " · " + notes.join(", ")).join("\n"),
    source_note: source.source + (source.source_page ? " · p. " + source.source_page : ""),
  };

  return <main className={styles.page}>
    <Link href="/admin">← Administration</Link>
    <h1>Catalogue Chogan</h1>
    {Object.hasOwn(messages, params.result) && <p role="status">{messages[params.result]}</p>}
    <section className={styles.panel}>
      <h2>Produits</h2>
      <form className={styles.form}>
        <label>Rechercher par référence<input name="q" defaultValue={term} maxLength={80} /></label>
        <button>Rechercher</button>
      </form>
      <ul>{products.data.slice(0, 50).map(product => <li key={product.id}>
        <Link href={"?product=" + product.id}>{product.reference} · {product.title}</Link> · {product.visible ? "Public" : "Masqué"}
      </li>)}</ul>
      {products.data.length > 50 && <p>Affinez la recherche pour retrouver les autres références.</p>}
      <h3>{selected.data ? "Modifier " + selected.data.reference : "Ajouter un produit"}</h3>
      {selected.data && <p><Link href="/admin/catalogue">Ajouter un produit</Link></p>}
      {!selected.data && <form className={styles.form}>
        <label>Référence Expert Parfums<input name="parfum" defaultValue={perfumeRef} maxLength={24} required /></label>
        <button>Préremplir les notes officielles</button>
      </form>}
      {perfumeRef && !source && <p>Référence introuvable dans Expert Parfums.</p>}
      <ProductForm key={selected.data?.id ?? (source?.reference || "new")} product={selected.data ?? draft} />
    </section>
    <section className={styles.panel}>
      <h2>Codes promo généraux</h2>
      <ul>{promos.data.map(promo => <li key={promo.code}>{promo.code} · {promo.discount_bp / 100} % · {promo.active ? "Actif" : "Inactif"}</li>)}</ul>
      <form action={savePromo} className={styles.form}>
        <label>Code à créer ou modifier<input name="code" minLength={3} maxLength={30} required /></label>
        <label>Remise (%)<input name="discount" type="number" min=".01" max="100" step=".01" required /></label>
        <label><input name="active" type="checkbox" /> Actif</label>
        <button>Enregistrer le code</button>
      </form>
    </section>
    <section className={styles.panel}>
      <h2>Accès public d’un consultant</h2>
      <form className={styles.form}>
        <label>Identifiant public du catalogue<input name="catalogue" defaultValue={typeof params.catalogue === "string" ? params.catalogue : ""} required /></label>
        <button>Rechercher</button>
      </form>
      {params.catalogue && !catalogue.data && <p>Catalogue introuvable.</p>}
      {catalogue.data && <form action={toggleCatalogue} className={styles.form}>
        <input type="hidden" name="catalogue" value={catalogue.data.id} />
        <input type="hidden" name="enabled" value={catalogue.data.enabled ? "no" : "yes"} />
        <p>{catalogue.data.enabled ? "Catalogue actif" : "Catalogue désactivé"}</p>
        <button>{catalogue.data.enabled ? "Désactiver le catalogue" : "Réactiver le catalogue"}</button>
      </form>}
    </section>
  </main>;
}
