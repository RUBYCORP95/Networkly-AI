import { choganCodeFromTitle, listedChoganCode } from "./chogan-codes.mjs";

const storefront = "https://parfum-inspiration.com";
const validHandle = /^[a-z0-9][a-z0-9-]{0,199}$/;

async function shopify(path, allowMissing = false, cacheOptions = { cache: "no-store" }) {
  const response = await fetch(storefront + path, {
    ...cacheOptions,
    signal: AbortSignal.timeout(8000),
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error("Catalogue indisponible");
  return response.json();
}

const merchPath = "/collections/objets-personnalisables";
export const merchCollection = storefront + merchPath;

export async function getMerchProducts() {
  const products = new Map();
  const pageSize = 250;
  for (let page = 1; ; page += 1) {
    const data = await shopify(`${merchPath}/products.json?limit=${pageSize}&page=${page}`, false, { next: { revalidate: 1800 } });
    if (!Array.isArray(data?.products)) throw new Error("Collection Merch indisponible");
    const previousCount = products.size;
    for (const product of data.products) {
      if (typeof product?.handle !== "string" || !validHandle.test(product.handle) ||
        typeof product.title !== "string" || !product.title.trim()) continue;
      const image = Array.isArray(product.images)
        ? product.images.find(item => typeof item?.src === "string" && item.src.startsWith("https://cdn.shopify.com/"))
        : null;
      products.set(product.handle, {
        handle: product.handle,
        title: product.title.trim(),
        href: `${storefront}/products/${product.handle}`,
        image: image?.src,
      });
    }
    if (data.products.length < pageSize || products.size === previousCount) return [...products.values()];
  }
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
  const attempts = await Promise.allSettled([
    suggestProducts(query, fields),
    ...(number === null ? [] : [...new Set([String(number).padStart(3, "0"), String(number)])]
      .map(value => suggestProducts("parfum chogan " + value, "title"))),
  ]);
  if (number === null && attempts[0].status === "rejected") throw attempts[0].reason;
  const [primary, ...alternatives] = attempts.map(result => result.status === "fulfilled" ? result.value : []);
  const matchingTitles = alternatives.flat().filter(product =>
    matchesArticleCode({reference: "", title: product.title ?? ""}, query));
  const handles = [...primary, ...matchingTitles].map(product => product.handle);
  if (number !== null) handles.push("parfum-chogan-n-" + number);
  return [...new Set(handles.filter(handle => validHandle.test(handle)))].slice(0, number === null ? 6 : 31);
}
