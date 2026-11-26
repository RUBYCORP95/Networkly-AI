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
