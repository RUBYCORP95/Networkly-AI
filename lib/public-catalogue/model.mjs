export const categories = {
  parfums: "Parfums Olfazeta", visage: "Soins visage", corps: "Soins corps", cheveux: "Soins cheveux",
  maquillage: "Maquillage LOLÛM", entretien: "Entretien Brilhome", ambiance: "Parfums d’ambiance",
  "bien-etre": "Bien-être", hygiene: "Hygiène", solaires: "Solaires",
};

export function readCart(input) {
  if (!Array.isArray(input) || !input.length || input.length > 20) return null;
  const cart = input.map(line => ({ id: line?.id, quantity: line?.quantity }));
  if (cart.some(line => typeof line.id !== "string" || !/^[1-9][0-9]{0,17}$/.test(line.id) ||
      !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) ||
      new Set(cart.map(line => line.id)).size !== cart.length) return null;
  return cart;
}

export function normalizeSearch(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
