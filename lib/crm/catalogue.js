const storefront = "https://parfum-inspiration.com";
const validHandle = /^[a-z0-9][a-z0-9-]{0,199}$/;

async function shopify(path) {
  const response = await fetch(storefront + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Catalogue indisponible");
  return response.json();
}

export async function getVariants(handle) {
  if (!validHandle.test(handle)) return [];
  const product = await shopify("/products/" + handle + ".js");
  return (product.variants ?? []).flatMap(variant => {
    if (!variant.available || !Number.isSafeInteger(variant.price) || variant.price < 0) return [];
    return [{
      id: String(variant.id), handle, title: product.title,
      format: variant.title === "Default Title" ? "" : variant.title,
      reference: variant.sku || "",
      unit_cents: variant.price,
    }];
  });
}

export async function requireEuroCatalogue() {
  const cart = await shopify("/cart.js");
  if (cart.currency !== "EUR") throw new Error("Tarifs EUR indisponibles");
}

export async function findProducts(query) {
  const productPath = query.match(/^(?:https:\/\/parfum-inspiration\.com)?\/(?:collections\/[a-z0-9-]+\/)?products\/([a-z0-9-]+)\/?(?:[?#].*)?$/);
  if (productPath) return [productPath[1]];
  const params = new URLSearchParams({
    q: query, "resources[type]": "product", "resources[limit]": "6",
    "resources[options][fields]": "title,variants.sku",
  });
  const data = await shopify("/search/suggest.json?" + params);
  return (data.resources?.results?.products ?? []).map(product => product.handle).filter(handle => validHandle.test(handle)).slice(0, 6);
}
