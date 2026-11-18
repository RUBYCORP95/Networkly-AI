import { normalize } from "./expert.mjs";

export const scentoSource = "https://raw.githubusercontent.com/Scento-com/perfume-dataset/086769ecf1add770ea6646bd4d88d39f0e7cddeb/perfumes.jsonl";
const translations = new Map([
  ["Musk", "Musc"], ["White Musk", "Musc blanc"], ["Vanilla", "Vanille"], ["Bergamot", "Bergamote"],
  ["Jasmine", "Jasmin"], ["Sandalwood", "Bois de santal"], ["Cedarwood", "Cèdre"], ["Amber", "Ambre"],
  ["Mandarin", "Mandarine"], ["Tonka Bean", "Fève de tonka"], ["Orange Blossom", "Fleur d’oranger"],
  ["Lemon", "Citron"], ["Lavender", "Lavande"], ["Pink Pepper", "Poivre rose"], ["Cardamom", "Cardamome"],
  ["Leather", "Cuir"], ["Oakmoss", "Mousse de chêne"], ["Pepper", "Poivre"], ["Geranium", "Géranium"],
  ["Saffron", "Safran"], ["Grapefruit", "Pamplemousse"], ["Apple", "Pomme"], ["Cinnamon", "Cannelle"],
  ["Violet", "Violette"], ["Blackcurrant", "Cassis"], ["Ginger", "Gingembre"], ["Benzoin", "Benjoin"],
  ["Pear", "Poire"], ["Peach", "Pêche"], ["Neroli", "Néroli"], ["Nutmeg", "Noix de muscade"],
  ["Lily of the Valley", "Muguet"], ["Tuberose", "Tubéreuse"], ["Ambergris", "Ambre gris"], ["Incense", "Encens"],
  ["Mint", "Menthe"], ["Raspberry", "Framboise"], ["Peony", "Pivoine"], ["Jasmine Sambac", "Jasmin sambac"],
  ["Sage", "Sauge"], ["Tobacco", "Tabac"], ["Woody notes", "Notes boisées"], ["Juniper", "Genévrier"],
  ["Pineapple", "Ananas"], ["Gardenia", "Gardénia"], ["Cashmere Wood", "Bois de cachemire"],
  ["Petitgrain", "Petit grain"], ["Heliotrope", "Héliotrope"], ["Coconut", "Noix de coco"], ["Plum", "Prune"],
  ["Clary Sage", "Sauge sclarée"], ["Citrus", "Agrumes"], ["Lychee", "Litchi"], ["Almond", "Amande"],
  ["Guaiac Wood", "Bois de gaïac"], ["Tea", "Thé"], ["Violet Leaf", "Feuille de violette"], ["Coriander", "Coriandre"],
  ["Rosemary", "Romarin"], ["Honey", "Miel"], ["Myrrh", "Myrrhe"], ["Cypress", "Cyprès"], ["Coffee", "Café"],
  ["Fig", "Figue"], ["Clove", "Clou de girofle"], ["Lime", "Citron vert"], ["Praline", "Praliné"],
  ["Sea Notes", "Notes marines"], ["Orchid", "Orchidée"], ["Basil", "Basilic"], ["Lily", "Lys"],
  ["Green leaves", "Feuilles vertes"], ["Rum", "Rhum"], ["Honeysuckle", "Chèvrefeuille"], ["Suede", "Daim"],
  ["Chocolate", "Chocolat"], ["Strawberry", "Fraise"], ["Cherry", "Cerise"], ["Blood Orange", "Orange sanguine"],
  ["Bitter orange", "Bigarade"], ["Carnation", "Œillet"], ["Floral notes", "Notes florales"],
  ["Aldehydes", "Aldéhydes"], ["White Flowers", "Fleurs blanches"], ["Daffodil", "Narcisse"],
  ["Passion fruit", "Fruit de la passion"], ["Mango", "Mangue"], ["Artemisia", "Armoise"],
  ["Balsam of Peru", "Baume du Pérou"], ["Aquatic Accord", "Accord aquatique"], ["Opoponax", "Opoponax"],
]);

const concentrations = {
  "eau-de-parfum": "Eau de parfum", "eau-de-toilette": "Eau de toilette", "eau-de-cologne": "Eau de Cologne",
  "extrait-de-parfum": "Extrait de parfum", parfum: "Parfum",
};

export function parseScentoIndex(raw) {
  return raw.trim().split(/\r?\n/).map(line => JSON.parse(line)).map(row => {
    const translate = items => items.map(note => translations.get(note) ?? note);
    return {
      id: row.id, name: row.name, house: row.house, url: row.url, year: row.year,
      concentration: concentrations[row.concentration] ?? row.concentration.replaceAll("-", " "),
      tete: translate(row.top_notes), coeur: translate(row.heart_notes), fond: translate(row.base_notes),
      notes: [...new Set(translate(row.notes))],
    };
  });
}

export function searchScentoIndex(index, query) {
  const words = normalize(query).replace(/\bedp\b/g, "eau de parfum").replace(/\bedt\b/g, "eau de toilette")
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return [];
  return index.filter(perfume => {
    const label = normalize([perfume.name, perfume.house, perfume.concentration, perfume.year ?? ""].join(" "));
    return words.every(word => label.includes(word));
  }).slice(0, 8);
}
