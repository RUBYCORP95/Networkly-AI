import { choganCodeFromTitle, listedChoganCode } from "./chogan-codes.mjs";

const storefront = "https://parfum-inspiration.com";
const validHandle = /^[a-z0-9][a-z0-9-]{0,199}$/;

async function shopify(path, allowMissing = false) {
  const response = await fetch(storefront + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error("Catalogue indisponible");
  return response.json();
}

export async function getVariants(handle) {
  if (!validHandle.test(handle)) return [];
  const product = await shopify("/products/" + handle + ".js", true);
  return (product?.variants ?? []).flatMap(variant => {
    if (!variant.available || !Number.isSafeInteger(variant.price) || variant.price < 0) return [];
    return [{
      id: String(variant.id), handle, title: product.title,
      format: variant.title === "Default Title" ? "" : variant.title,
      reference: variant.sku || "",
      chogan_code: choganCodeFromTitle(product.title),
      unit_cents: variant.price,
    }];
  });
}

export async function requireEuroCatalogue() {
  const cart = await shopify("/cart.js");
  if (cart.currency !== "EUR") throw new Error("Tarifs EUR indisponibles");
}

export function matchesArticleCode(item, query) {
  if (item.reference.trim().toUpperCase().startsWith(query.toUpperCase())) return true;
  const code = listedChoganCode(query);
  return code !== null && choganCodeFromTitle(item.title) === code;
}

async function suggestProducts(query, fields) {
  const params = new URLSearchParams({
    q: query, "resources[type]": "product", "resources[limit]": "10",
    "resources[options][fields]": fields,
  });
  const data = await shopify("/search/suggest.json?" + params);
  return (data.resources?.results?.products ?? []);
}

export async function findProducts(query, mode) {
  const productPath = query.match(/^(?:https:\/\/parfum-inspiration\.com)?\/(?:collections\/[a-z0-9-]+\/)?products\/([a-z0-9-]+)\/?(?:[?#].*)?$/);
  if (productPath && mode !== "code") return [productPath[1]];
  const listedCode = mode === "code" ? listedChoganCode(query) : null;
  const number = listedCode ? Number.parseInt(listedCode, 10) : null;
  const fields = mode === "code" ? "variants.sku" : mode === "name" ? "title" : "title,variants.sku";
  const [primary, ...alternatives] = await Promise.all([
    suggestProducts(query, fields),
    ...(number === null ? [] : [...new Set([String(number).padStart(3, "0"), String(number)])]
      .map(value => suggestProducts("parfum chogan " + value, "title"))),
  ]);
  const matchingTitles = alternatives.flat().filter(product =>
    matchesArticleCode({reference: "", title: product.title ?? ""}, query));
  const handles = [...primary, ...matchingTitles].map(product => product.handle);
  if (number !== null) handles.push("parfum-chogan-n-" + number);
  return [...new Set(handles.filter(handle => validHandle.test(handle)))].slice(0, number === null ? 6 : 31);
}
