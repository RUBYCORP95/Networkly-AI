import assert from "node:assert/strict";
import test from "node:test";
import { catalogueHandle, getVariants, loadCatalogueItems, searchCatalogueItems } from "../lib/crm/catalogue.js";

function product(id, title, { available = true, sku = "REF-" + id, price = "15.00" } = {}) {
  return {
    handle: "product-" + id,
    title,
    variants: [{ id, title: "Default Title", available, sku, price }],
  };
}

test("catalogue search includes every matching product across Shopify pages", async t => {
  const fillers = Array.from({ length: 240 }, (_, index) => product(index + 1, "Savon"));
  const cases = Array.from({ length: 16 }, (_, index) =>
    product(index + 241, "Étui <br> Modern " + index, { available: index < 12 }));
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    const page = Number(new URL(url).searchParams.get("page"));
    calls.push(page);
    const products = page === 1 ? [...fillers, ...cases.slice(0, 10)] : cases.slice(10);
    return Response.json({ products });
  });

  const catalogue = await loadCatalogueItems();
  const results = searchCatalogueItems(catalogue, "etui modern", "name");
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(results.map(item => item.id), cases.slice(0, 12).map(entry => String(entry.variants[0].id)));
  assert.ok(results.every(item => item.unit_cents === 1500));
});

test("product lookup keeps SKU prefixes, Chogan codes and direct product links", async t => {
  const caseProduct = product(1, "Étui Modern", { sku: "TCOV010" });
  const perfume = product(2, "Parfum Chogan n° 20", { sku: "020A" });
  const invalidPrice = product(3, "Étui au tarif invalide", { price: "" });
  t.mock.method(globalThis, "fetch", async url => new URL(url).pathname === "/products.json"
    ? Response.json({ products: [caseProduct, perfume, invalidPrice] })
    : Response.json(product(1, "Étui Modern", { sku: "TCOV010", price: 1500 })));

  const catalogue = await loadCatalogueItems();
  assert.equal(catalogue.length, 2);
  assert.deepEqual(searchCatalogueItems(catalogue, "tcov01", "code").map(item => item.id), ["1"]);
  assert.deepEqual(searchCatalogueItems(catalogue, "020M", "code").map(item => item.id), ["2"]);
  const handle = catalogueHandle("https://parfum-inspiration.com/collections/etuis/products/product-1?source=tesami");
  assert.equal(handle, caseProduct.handle);
  assert.deepEqual(await getVariants(handle), [catalogue[0]]);
});

test("catalogue uses the live 30 ml perfume variant when the bulk feed still says 35 ml", async t => {
  const perfume = product(131, "Parfum CHOGAN n°131", { sku: "3131A", price: "25.50" });
  perfume.variants[0].title = "35 ml";
  const other = product(132, "Parfum CHOGAN n°132", { sku: "3132A", price: "23.50" });
  other.variants[0].title = "35 ml";
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === "/products.json") return Response.json({ products: [perfume, other] });
    const entry = path === "/products/product-131.js" ? perfume : other;
    return Response.json({
      ...entry,
      variants: entry.variants.map(variant => ({
        ...variant, title: entry === perfume ? "30 ml" : "35 ml", price: Number(variant.price) * 100,
      })),
    });
  });

  const items = await loadCatalogueItems();
  assert.deepEqual(calls, ["/products.json", "/products/product-131.js", "/products/product-132.js"]);
  assert.deepEqual(items.map(({ format, reference, unit_cents }) => ({ format, reference, unit_cents })),
    [{ format: "30 ml", reference: "3131A", unit_cents: 2550 }]);
  assert.deepEqual(await getVariants(other.handle), []);
});
