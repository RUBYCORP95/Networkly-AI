import assert from "node:assert/strict";
import test from "node:test";
import { findPerfumes, rankPerfumes, whatsappLink } from "../lib/parfums/expert.mjs";

const catalogue = [
  { reference: "055W", nom: "Olfazeta n°055", inspiration: "Black Opium · Yves Saint Laurent",
    public_cible: "femme", famille: "Oriental vanillé", tete: ["Poire"], coeur: ["Café"], fond: ["Vanille"] },
  { reference: "155U", nom: "Olfazeta n°155", inspiration: "CK One",
    public_cible: "mixte", famille: "Hespéridé", tete: ["Citron"], coeur: ["Citron", "Muguet"], fond: [] },
];

test("trouve une référence courte ou complète et un parfum même sans accents", () => {
  for (const query of ["55", "055W", "n°055", "Yves Black Opium", "oriental vanille"]) {
    assert.deepEqual(findPerfumes(catalogue, query).map(row => row.reference), ["055W"]);
  }
  assert.deepEqual(findPerfumes(catalogue, "057W"), []);
  assert.deepEqual(findPerfumes(catalogue, ""), catalogue);
});

test("compte chaque note une fois, explique les niveaux et filtre le public", () => {
  const [result] = rankPerfumes(catalogue, "mixte", ["citron", "CITRON", "Lavande"]);
  assert.equal(result.score, 50);
  assert.deepEqual(result.matches, [{ note: "CITRON", stages: ["tete", "coeur"] }]);
  assert.deepEqual(result.missing, ["Lavande"]);
  assert.deepEqual(rankPerfumes(catalogue, "homme", ["citron"]), []);
  assert.deepEqual(rankPerfumes(catalogue, "tous", ["rose"]), []);
  assert.equal(rankPerfumes(catalogue, "femme", ["CAFE"])[0].score, 100);
});

test("partage les trois niveaux et conserve les caractères français", () => {
  const url = new URL(whatsappLink(catalogue[1]));
  assert.equal(url.host, "wa.me");
  assert.match(url.searchParams.get("text"), /Cœur · Citron, Muguet\nFond · Non documenté/);
});
