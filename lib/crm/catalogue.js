import { choganCodeFromTitle, listedChoganCode } from "./chogan-codes.mjs";
import { parseCents } from "./money.mjs";

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

function isLegacyPerfumeFormat(title, format) {
  return /\bparfums?\b/i.test(title) && /^35\s*ml$/i.test(format?.trim());
}

function orderableVariants(product, handle, readPrice) {
  const chogan_code = choganCodeFromTitle(product.title);
  return (product.variants ?? []).flatMap(variant => {
    const price = readPrice(variant.price);
    if (!variant.available || !Number.isSafeInteger(price) || price < 0 ||
        isLegacyPerfumeFormat(product.title, variant.title)) return [];
    return [{
      id: String(variant.id), handle, title: product.title,
      format: variant.title === "Default Title" ? "" : variant.title,
      reference: variant.sku || "",
      chogan_code,
      unit_cents: price,
    }];
  });
}

export async function getVariants(handle) {
  if (!validHandle.test(handle)) return [];
  const product = await shopify("/products/" + handle + ".js", true);
  return product ? orderableVariants(product, handle, price => price) : [];
}

export async function loadCatalogueItems() {
  const itemsByProduct = new Map();
  const refreshHandles = [];
  const pageSize = 250;
  for (let page = 1; ; page += 1) {
    const { products } = await shopify(`/products.json?limit=${pageSize}&page=${page}`);
    if (!Array.isArray(products)) throw new Error("Catalogue indisponible");
    const previousCount = itemsByProduct.size;
    for (const product of products) {
      if (typeof product?.handle !== "string" || !validHandle.test(product.handle) ||
          typeof product.title !== "string" || !product.title.trim() || itemsByProduct.has(product.handle)) continue;
      itemsByProduct.set(product.handle, orderableVariants(product, product.handle, parseCents));
      if (product.variants?.some(variant => isLegacyPerfumeFormat(product.title, variant.title))) {
        refreshHandles.push(product.handle);
      }
    }
    if (products.length < pageSize) break;
    if (itemsByProduct.size === previousCount) throw new Error("Pagination du catalogue incomplète");
  }

  // Product pages can publish the new 30 ml variant before the catalogue feed.
  const batchSize = 8;
  for (let offset = 0; offset < refreshHandles.length; offset += batchSize) {
    const handles = refreshHandles.slice(offset, offset + batchSize);
    const variants = await Promise.allSettled(handles.map(getVariants));
    variants.forEach((result, index) => {
      if (result.status === "fulfilled") itemsByProduct.set(handles[index], result.value);
    });
  }
  return [...itemsByProduct.values()].flat();
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

export function catalogueHandle(query) {
  return query.match(/^(?:https:\/\/parfum-inspiration\.com)?\/(?:collections\/[a-z0-9-]+\/)?products\/([a-z0-9-]+)\/?(?:[?#].*)?$/)?.[1];
}

function normalizeProductName(value) {
  return value.replace(/<[^>]+>/g, " ").normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function searchCatalogueItems(items, query, mode) {
  if (mode === "code") return items.filter(item => matchesArticleCode(item, query));

  const name = normalizeProductName(query);
  const terms = name ? name.split(" ") : [];
  const code = query.toUpperCase();

  return items.flatMap(item => {
    const title = normalizeProductName(item.title);
    const titleWords = title.split(" ");
    if (terms.length && terms.every(term => titleWords.some(word => word.startsWith(term)))) {
      const rank = title === name ? 0 : title.startsWith(name) ? 1 : title.includes(name) ? 2 : 3;
      return [{ item, rank }];
    }
    if (mode !== "name" && item.reference.trim().toUpperCase().startsWith(code)) return [{ item, rank: 3 }];
    return [];
  }).sort((left, right) => left.rank - right.rank).map(({ item }) => item);
}
